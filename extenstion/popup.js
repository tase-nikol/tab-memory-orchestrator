function $(id) {
    return document.getElementById(id);
  }
  
  async function loadState() {
    const response = await chrome.runtime.sendMessage({ type: "get_popup_state" });
  
    if (!response) return;
  
    // Pressure
    const pressureEl = $("pressure");
    const scoreText = (response.pressureScore == null) ? "" : ` (${response.pressureScore}/100)`; 
    pressureEl.textContent = `${response.pressureLevel}${scoreText}`;
  
    pressureEl.className = "value";
    if (response.pressureLevel === "LOW") pressureEl.classList.add("status-low");
    if (response.pressureLevel === "MEDIUM") pressureEl.classList.add("status-medium");
    if (response.pressureLevel === "HIGH") pressureEl.classList.add("status-high");
    
    $("reasons").textContent = (response.pressureReasons && response.pressureReasons.length) ? response.pressureReasons.join(", ") : "—";

    // Memory
    $("memory").textContent =
      `Free: ${response.freePercent}% | Used: ${response.usedPercent}%`;
  
    // Battery
    $("battery").textContent = response.batteryText;
  
    // Last discarded
    $("lastDiscarded").textContent = response.lastDiscarded || "None";
  
    // Toggle
    $("toggleBtn").textContent =
      response.enabled ? "Disable Orchestrator" : "Enable Orchestrator";

    // History
    if (response.discardedHistory && response.discardedHistory.length) {
      $("history").innerHTML = response.discardedHistory
        .map(item => {
          const time = new Date(item.time).toLocaleTimeString();
          return `• ${item.title} <span style="color:#888">(${time})</span>`;
        })
        .join("<br>");
    } else {
      $("history").textContent = "None";
    } 

    $("focusInfo").textContent =
      response.focusEnabled
        ? `ON • cluster size: ${response.focusClusterSize ?? "?"}`
        : "OFF";

    $("toggleFocusBtn").textContent =
      response.focusEnabled ? "Disable Focus Mode" : "Enable Focus Mode";

  }
  
  async function toggle() {
    await chrome.runtime.sendMessage({ type: "toggle_enabled" });
    loadState();
  }
  
  document.addEventListener("DOMContentLoaded", loadState);
  $("toggleBtn").addEventListener("click", toggle);

  $("discardNowBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "discard_now" });
    loadState();
  });
  
  $("openOptionsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  $("toggleFocusBtn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "toggle_focus_mode" });
    loadState();
  });