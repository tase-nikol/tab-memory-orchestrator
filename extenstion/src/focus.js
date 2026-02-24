import { clusterWindowMs } from "./settings.js";

export function getHostnameSafe(url) {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

// Focus cluster = active tab's hostname tabs + recently active tabs in same window, capped
export async function computeFocusCluster(appState, now) {
  const tabs = await chrome.tabs.query({});
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  const activeHost = getHostnameSafe(activeTab?.url);
  const activeWindowId = activeTab?.windowId;
  const winMs = clusterWindowMs(appState.settings);

  const sameHostIds = [];
  const recentSameWindow = [];

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const host = getHostnameSafe(tab.url);
    const lastActive = appState.tabActivity.get(tab.id) ?? 0;

    if (activeHost && host === activeHost) {
      sameHostIds.push(tab.id);
    } else if (activeWindowId != null && tab.windowId === activeWindowId) {
      const recentlyActive = (now - lastActive) <= winMs;
      if (recentlyActive) recentSameWindow.push({ id: tab.id, lastActive });
    }
  }

  recentSameWindow.sort((a, b) => b.lastActive - a.lastActive);

  const MAX_CLUSTER = 12;
  const inCluster = new Set();

  if (activeTab?.id != null) inCluster.add(activeTab.id);
  for (const id of sameHostIds) inCluster.add(id);

  for (const item of recentSameWindow) {
    if (inCluster.size >= MAX_CLUSTER) break;
    inCluster.add(item.id);
  }

  appState.lastFocusClusterSize = inCluster.size;
  return { inCluster, activeHost };
}