export function wireActivityTracking(appState) {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      appState.tabActivity.set(activeInfo.tabId, Date.now());
    });
  
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "complete") {
        appState.tabActivity.set(tabId, Date.now());
      }
    });
  
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      const [activeTab] = await chrome.tabs.query({ windowId, active: true });
      if (activeTab?.id != null) appState.tabActivity.set(activeTab.id, Date.now());
    });
  }
  
  export async function initActivityMap(appState, ttlMsNormal) {
    const now = Date.now();
    const tabs = await chrome.tabs.query({});
  
    for (const tab of tabs) {
      if (tab.id == null || appState.tabActivity.has(tab.id)) continue;
  
      // Active tab = now, others = now - normal TTL (so TTL doesn't block forever after reload)
      if (tab.active) appState.tabActivity.set(tab.id, now);
      else appState.tabActivity.set(tab.id, now - ttlMsNormal);
    }
  
    console.log(`Initialized activity map for ${tabs.length} tabs`);
  }