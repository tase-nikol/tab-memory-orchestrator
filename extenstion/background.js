import { appState } from "./src/state.js";
import { loadSettings, ttlMsNormal, cooldownMs } from "./src/settings.js";
import { connectNative, requestSystemState } from "./src/native.js";
import { wireActivityTracking, initActivityMap } from "./src/activity.js";
import { wireMessageHandlers } from "./src/messages.js";
import { pruneOneTab, pruneBatch } from "./src/prune.js";

const HOST_NAME = "com.tasenikol.tab_memory_orchestrator";
const CHECK_INTERVAL_MS = 30_000;

async function refreshSettings() {
  const { settings, protectedDomainsSet } = await loadSettings(appState.settings);
  appState.settings = settings;
  appState.protectedDomainsSet = protectedDomainsSet;
  console.log("Settings loaded:", appState.settings);
}

function handleSystemState(state) {
  appState.lastSystemState = state;

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

  // Dev log
  console.log("System check:", {
    pressureLevel,
    pressureScore,
    reasons: pressureReasons,
    freeMB: state.ram_free_mb
  });

  if (!appState.orchestratorEnabled) return;

  const shouldAttempt =
    pressureLevel !== "LOW" ||
    (appState.settings.focusEnabled && appState.settings.focusProactive);

  if (!shouldAttempt) return;

  const now = Date.now();
  const cd = cooldownMs(appState.settings);
  if (now - appState.lastPruneTime < cd) return;

  appState.lastPruneTime = now;

  if (pressureLevel === "HIGH") {
    pruneBatch(appState, now, 2).catch(console.error);
  } else {
    pruneOneTab(appState, now).catch(console.error);
  }
}

async function start() {
  await refreshSettings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    refreshSettings().catch(console.error);
  });

  wireActivityTracking(appState);
  wireMessageHandlers(appState);

  // initialize activity map using current normal TTL
  await initActivityMap(appState, ttlMsNormal(appState.settings));

  connectNative(appState, HOST_NAME, handleSystemState);

  setInterval(() => {
    // Ensure native is connected (in case it dropped)
    connectNative(appState, HOST_NAME, handleSystemState);
    requestSystemState(appState);
  }, CHECK_INTERVAL_MS);

  requestSystemState(appState);
}

start().catch(console.error);