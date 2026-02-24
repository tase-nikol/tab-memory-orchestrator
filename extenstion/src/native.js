export function connectNative(appState, hostName, onState) {
    if (appState.port) return;
  
    const port = chrome.runtime.connectNative(hostName);
    appState.port = port;
  
    port.onMessage.addListener((msg) => {
      if (msg && msg.type_ === "state") {
        onState(msg);
      } else {
        console.log("Native host message (non-state):", msg);
      }
    });
  
    port.onDisconnect.addListener(() => {
      console.warn("Disconnected from native host:", chrome.runtime.lastError);
      appState.port = null;
    });
  }
  
  export function requestSystemState(appState) {
    if (!appState.port) return;
    appState.port.postMessage({ type: "get_state" });
  }