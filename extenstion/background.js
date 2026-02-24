// background.js (MV3 service worker)

const HOST_NAME = "com.tasenikol.tab_memory_orchestrator";
let port = null;

const tabActivity = new Map();

const PROTECTED_URL_PREFIXES = ["chrome://", "about:"];

// ---- SETTINGS (loaded from storage) ----
let settings = {
  ttlMinutes: 15,
  cooldownSeconds: 60,
  freeRamPercent: 12,
  usedRamPercent: 85,
  protectedDomains: [],

  // Focus Mode settings
  focusEnabled: false,
  focusProactive: false,
  focusClusterMinutes: 10,
  focusOutTtlMinutes: 3,
  focusMaxClusterSize: 12
};

let protectedDomainsSet = new Set();
let lastPruneTime = 0;
let lastSystemState = null;
let lastDiscardedInfo = null;
let orchestratorEnabled = true;

let discardedHistory = []; // newest first
const MAX_HISTORY = 5;

// Focus stats for popup
let lastFocusClusterSize = null;
// ---------------------------------------

async function loadSettings() {
  const defaults = { ...settings };
  const stored = await chrome.storage.local.get(defaults);
  settings = stored;

  protectedDomainsSet = new Set(stored.protectedDomains || []);

  console.log("Settings loaded:", settings);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  // Reload everything on any relevant change (simple + safe)
  loadSettings().catch(console.error);
});

function connectNative() {
  if (port) return;

  port = chrome.runtime.connectNative(HOST_NAME);

  port.onMessage.addListener((msg) => {
    if (msg && msg.type_ === "state") {
      handleSystemState(msg);
    } else {
      console.log("Native host message (non-state):", msg);
    }
  });

  port.onDisconnect.addListener(() => {
    console.warn("Disconnected from native host:", chrome.runtime.lastError);
    port = null;
  });
}

function requestSystemState() {
  connectNative();
  if (port) port.postMessage({ type: "get_state" });
}

function isProtectedUrl(url) {
  if (!url) return true;

  for (const prefix of PROTECTED_URL_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }

  try {
    const host = new URL(url).hostname;
    return protectedDomainsSet.has(host);
  } catch {
    return true;
  }
}

function ttlMsNormal() {
  return Math.max(1, settings.ttlMinutes) * 60_000;
} 

function ttlMsFocusOutOfCluster() {
  return Math.max(1, settings.focusOutTtlMinutes) * 60_000;
}

function cooldownMs() {
  return Math.max(10, settings.cooldownSeconds) * 1000;
}

function clusterWindowMs() {
  return Math.max(1, settings.focusClusterMinutes) * 60_000;
}

function getHostnameSafe(url) {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

// --- Focus Mode Cluster ---
// Cluster = tabs on same hostname as active tab OR recently active within focusClusterMinutes 
// cluster stays around what you’re actually doing right now. 
// tabs in other windows don’t accidentally become protected just because you glanced at them.  
// the max cluster size prevents "cluster inflation".
async function computeFocusCluster(now) {
  const tabs = await chrome.tabs.query({});
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const activeHost = getHostnameSafe(activeTab?.url);
  const winMs = clusterWindowMs();

  // Only consider “recently active” tabs in the same window as the active tab
  const activeWindowId = activeTab?.windowId;

  // Start with same-host tabs
  const sameHost = [];
  const recentSameWindow = [];

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const host = getHostnameSafe(tab.url);
    const lastActive = tabActivity.get(tab.id) ?? 0;
    const recentlyActive = (now - lastActive) <= winMs;

    if (activeHost && host === activeHost) {
      sameHost.push(tab.id);
    } else if (activeWindowId != null && tab.windowId === activeWindowId && recentlyActive) {
      recentSameWindow.push({ id: tab.id, lastActive });
    }
  }

  // Sort recent tabs by most recent first and cap cluster size
  recentSameWindow.sort((a, b) => b.lastActive - a.lastActive);

  const MAX_CLUSTER = 12;
  const inCluster = new Set();

  // Always include active tab
  if (activeTab?.id != null) inCluster.add(activeTab.id);

  for (const id of sameHost) inCluster.add(id);

  for (const item of recentSameWindow) {
    if (inCluster.size >= MAX_CLUSTER) break;
    inCluster.add(item.id);
  }

  lastFocusClusterSize = inCluster.size;
  return { inCluster, activeHost };
}

// --- Core Policy Logic ---
// Uses Rust pressure_level + (optionally) focusProactive behavior
function handleSystemState(state) { 
  lastSystemState = state;

  const usedPercent = state.ram_used_mb / state.ram_total_mb;
  const freePercent = state.ram_free_mb / state.ram_total_mb;

  const pressureLevel = state.pressure_level || "LOW";
  const pressureScore = typeof state.pressure_score === "number" ? state.pressure_score : null;
  const pressureReasons = Array.isArray(state.pressure_reasons) ? state.pressure_reasons : [];

  state._computed = {
    pressureLevel,
    pressureScore,
    pressureReasons,
    freePercent: Math.round(freePercent * 100),
    usedPercent: Math.round(usedPercent * 100)
  };   

  // Log (useful during dev)
  const batteryInfo =
    state.on_battery == null
      ? "battery: n/a"
      : `battery: ${state.battery_percent?.toFixed?.(1) ?? state.battery_percent}% (${state.on_battery ? "on battery" : "plugged"})`;

  console.log("System check:", {
    pressureLevel,
    pressureScore,
    reasons: pressureReasons,
    freeMB: state.ram_free_mb,
    freePercent: Number(freePercent.toFixed(3)),
    usedPercent: Number(usedPercent.toFixed(3)),
    batteryInfo
  });

  if (!orchestratorEnabled) return;

  // Decide whether we even attempt pruning this cycle
  const shouldAttempt =
    pressureLevel !== "LOW" ||
    (settings.focusEnabled && settings.focusProactive);

  if (!shouldAttempt) return; 

  const now = Date.now();
  if (now - lastPruneTime < cooldownMs()) return;

  lastPruneTime = now;

  // Under HIGH pressure, prune up to 2. Under MEDIUM, prune 1.
  // Under proactive focus (pressure LOW), prune at most 1.
  if (pressureLevel === "HIGH") {
    pruneBatch(now, 2).catch(console.error);
  } else {
    pruneOneTab(now).catch(console.error);
  }
}


// --- Activity Tracking ---
chrome.tabs.onActivated.addListener((activeInfo) => {
  tabActivity.set(activeInfo.tabId, Date.now());
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    tabActivity.set(tabId, Date.now());
  }
}); 

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [activeTab] = await chrome.tabs.query({ windowId, active: true });
  if (activeTab?.id != null) tabActivity.set(activeTab.id, Date.now());
});

// On startup, initialize activity timestamps conservatively so we don’t discard immediately.
async function initActivityMap() {
  const now = Date.now();
  const tabs = await chrome.tabs.query({});

  const normalTtl = ttlMsNormal();

  for (const tab of tabs) {
    if (tab.id == null || tabActivity.has(tab.id)) continue;

    // Active tab = now, others = old enough to not block forever
    if (tab.active) {
      tabActivity.set(tab.id, now);
    } else {
      tabActivity.set(tab.id, now - normalTtl);
    }
  }

  console.log(`Initialized activity map for ${tabs.length} tabs`);
}

function recordDiscard(title) {
  const entry = { title, time: Date.now() };
  lastDiscardedInfo = title;

  discardedHistory.unshift(entry);
  if (discardedHistory.length > MAX_HISTORY) discardedHistory.pop();
}


// --- Candidate selection (TTL-gated, Focus Mode aware) ---
async function getCandidates(now, maxCount) {
  const tabs = await chrome.tabs.query({});

  // Compute focus cluster if enabled
  let focusCluster = null;
  if (settings.focusEnabled) {
    focusCluster = await computeFocusCluster(now);
  } else {
    lastFocusClusterSize = null;
  }

  const normalTtl = ttlMsNormal();
  const focusOutTtl = ttlMsFocusOutOfCluster();

  const candidates = tabs
    .filter((tab) =>
      tab.id != null &&
      !tab.active &&
      !tab.pinned &&
      !tab.audible &&
      !tab.discarded &&
      !isProtectedUrl(tab.url)
    )
    .map((tab) => {
      const lastActive = tabActivity.get(tab.id) ?? 0;
      const inactiveMs = now - lastActive;

      const inCluster =
        settings.focusEnabled && focusCluster ? focusCluster.inCluster.has(tab.id) : false;

      // TTL rule:
      // - In Focus Mode: out-of-cluster tabs use shorter TTL
      // - In cluster tabs use normal TTL
      const ttl = settings.focusEnabled
        ? (inCluster ? normalTtl : focusOutTtl)
        : normalTtl;

      return {
        id: tab.id,
        title: tab.title || "(no title)",
        url: tab.url || "(no url)",
        lastActive,
        inactiveMs,
        ttl,
        inCluster
      };
    })
    .filter((t) => t.inactiveMs >= t.ttl)
    .sort((a, b) => a.lastActive - b.lastActive)
    .slice(0, maxCount);

  return candidates;
}

// --- Pruning Logic (deterministic & safe + TTL gate) ---
async function pruneOneTab(now) {
  const candidates = await getCandidates(now, 1);

  if (candidates.length === 0) {
    console.log("No eligible tabs to discard (TTL/Focus gate likely blocking).");
    return;
  }
  const target = candidates[0];

  console.log(
    `Discarding: [${target.id}] ${target.title} | inCluster=${target.inCluster} | inactive ${(target.inactiveMs / 60000).toFixed(1)}m`
  );
  
  await chrome.tabs.discard(target.id);
  recordDiscard(target.title);
}

async function pruneBatch(now, maxCount) {
  const candidates = await getCandidates(now, maxCount);

  if (candidates.length === 0) {
    console.log("No eligible tabs to discard in batch.");
    return;
  }

  for (const target of candidates) {
    console.log(
      `Batch discard: ${target.title} | inCluster=${target.inCluster} | inactive ${(target.inactiveMs / 60000).toFixed(1)}m`
    );
    await chrome.tabs.discard(target.id);
    recordDiscard(target.title);
  }
}

async function debugEligibility() {
  const now = Date.now();
  const tabs = await chrome.tabs.query({});
  const focusCluster = settings.focusEnabled ? await computeFocusCluster(now) : null;

  console.log("=== Eligibility Debug ===");
  console.log("Focus enabled:", settings.focusEnabled, "cluster size:", focusCluster?.inCluster?.size);

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const lastActive = tabActivity.get(tab.id) ?? 0;
    const inactiveMin = (now - lastActive) / 60000;

    const inCluster = settings.focusEnabled && focusCluster ? focusCluster.inCluster.has(tab.id) : false;
    const ttlMin = settings.focusEnabled
      ? (inCluster ? settings.ttlMinutes : settings.focusOutTtlMinutes)
      : settings.ttlMinutes;

    const reasons = [];
    if (tab.active) reasons.push("active");
    if (tab.pinned) reasons.push("pinned");
    if (tab.audible) reasons.push("audible");
    if (tab.discarded) reasons.push("already_discarded");
    if (isProtectedUrl(tab.url)) reasons.push("protected_url");
    if (inactiveMin < ttlMin) reasons.push(`ttl_block (${inactiveMin.toFixed(1)} < ${ttlMin})`);

    // Log only tabs that are blocked (keeps noise down)
    if (reasons.length) {
      console.log(`[BLOCKED] ${tab.title} | host=${getHostnameSafe(tab.url)} | inCluster=${inCluster} | reasons=${reasons.join(", ")}`);
    } else {
      console.log(`[ELIGIBLE] ${tab.title} | host=${getHostnameSafe(tab.url)} | inCluster=${inCluster} | inactive=${inactiveMin.toFixed(1)}m`);
    }
  }
}


// --- Messages for popup/buttons ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get_popup_state") {
    if (!lastSystemState) {
      sendResponse(null);
      return true;
    }

    const computed = lastSystemState._computed || {
      pressureLevel: lastSystemState.pressure_level || "LOW",
      pressureScore: lastSystemState.pressure_score ?? null,
      pressureReasons: lastSystemState.pressure_reasons ?? [],
      freePercent: null,
      usedPercent: null
    };

    let batteryText = "N/A";
    if (lastSystemState.on_battery != null) {
      batteryText =
        `${lastSystemState.battery_percent?.toFixed(1) ?? lastSystemState.battery_percent}% `
        + (lastSystemState.on_battery ? "(On Battery)" : "(Plugged)");
    }

    sendResponse({
      pressureLevel: computed.pressureLevel,
      pressureScore: computed.pressureScore,
      pressureReasons: computed.pressureReasons,
      freePercent: computed.freePercent,
      usedPercent: computed.usedPercent,
      batteryText,
      lastDiscarded: lastDiscardedInfo,
      discardedHistory,
      enabled: orchestratorEnabled,

      focusEnabled: !!settings.focusEnabled,
      focusClusterSize: lastFocusClusterSize
    });

    return true;
  }

  if (msg.type === "toggle_enabled") {
    orchestratorEnabled = !orchestratorEnabled;
    sendResponse({ enabled: orchestratorEnabled });
    return true;
  }

  if (msg.type === "discard_now") {
    if (!orchestratorEnabled) {
      sendResponse({ ok: false, reason: "disabled" });
      return true;
    }
    const now = Date.now();
    pruneOneTab(now).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "toggle_focus_mode") {
    const next = !settings.focusEnabled;
    chrome.storage.local.set({ focusEnabled: next }).then(() => {
      sendResponse({ focusEnabled: next });
    });
    return true;
  }
});

// --- Start ---
(async function start() {
  await loadSettings();
  await initActivityMap();

  setInterval(requestSystemState, 30_000);
  requestSystemState();
})();
 