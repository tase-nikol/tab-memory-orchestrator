import { ttlMsNormal, ttlMsFocusOut } from "./settings.js";
import { computeFocusCluster } from "./focus.js";

const PROTECTED_URL_PREFIXES = ["chrome://", "about:"];

function isProtectedUrl(appState, url) {
  if (!url) return true;

  for (const prefix of PROTECTED_URL_PREFIXES) {
    if (url.startsWith(prefix)) return true;
  }

  try {
    const host = new URL(url).hostname;
    return appState.protectedDomainsSet.has(host);
  } catch {
    return true;
  }
}

export async function getCandidates(appState, now, maxCount) {
  const tabs = await chrome.tabs.query({});

  let focusCluster = null;
  if (appState.settings.focusEnabled) {
    focusCluster = await computeFocusCluster(appState, now);
  } else {
    appState.lastFocusClusterSize = null;
  }

  const normalTtl = ttlMsNormal(appState.settings);
  const focusOutTtl = ttlMsFocusOut(appState.settings);

  const candidates = tabs
    .filter((tab) =>
      tab.id != null &&
      !tab.active &&
      !tab.pinned &&
      !tab.audible &&
      !tab.discarded &&
      !isProtectedUrl(appState, tab.url)
    )
    .map((tab) => {
      const lastActive = appState.tabActivity.get(tab.id) ?? 0;
      const inactiveMs = now - lastActive;

      const inCluster =
        appState.settings.focusEnabled && focusCluster
          ? focusCluster.inCluster.has(tab.id)
          : false;

      const ttl = appState.settings.focusEnabled
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