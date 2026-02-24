import { pruneOneTab } from "./prune.js";

export function wireMessageHandlers(appState) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "get_popup_state") {
      if (!appState.lastSystemState) {
        sendResponse(null);
        return true;
      }

      const computed = appState.lastSystemState._computed || {};
      let batteryText = "N/A";

      if (appState.lastSystemState.on_battery != null) {
        batteryText =
          `${appState.lastSystemState.battery_percent?.toFixed?.(1) ?? appState.lastSystemState.battery_percent}% `
          + (appState.lastSystemState.on_battery ? "(On Battery)" : "(Plugged)");
      }

      sendResponse({
        pressureLevel: computed.pressureLevel,
        pressureScore: computed.pressureScore,
        pressureReasons: computed.pressureReasons,
        freePercent: computed.freePercent,
        usedPercent: computed.usedPercent,
        batteryText,
        lastDiscarded: appState.lastDiscardedInfo,
        discardedHistory: appState.discardedHistory,
        enabled: appState.orchestratorEnabled,
        focusEnabled: !!appState.settings.focusEnabled,
        focusClusterSize: appState.lastFocusClusterSize
      });

      return true;
    }

    if (msg.type === "toggle_enabled") {
      appState.orchestratorEnabled = !appState.orchestratorEnabled;
      sendResponse({ enabled: appState.orchestratorEnabled });
      return true;
    }

    if (msg.type === "discard_now") {
      if (!appState.orchestratorEnabled) {
        sendResponse({ ok: false, reason: "disabled" });
        return true;
      }
      const now = Date.now();
      pruneOneTab(appState, now).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (msg.type === "toggle_focus_mode") {
      const next = !appState.settings.focusEnabled;
      chrome.storage.local.set({ focusEnabled: next }).then(() => {
        sendResponse({ focusEnabled: next });
      });
      return true;
    }

    return false;
  });
}