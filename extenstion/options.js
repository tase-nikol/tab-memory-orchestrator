  const DEFAULTS = {
    ttlMinutes: 15,
    cooldownSeconds: 60,
    freeRamPercent: 12,
    usedRamPercent: 85,
    protectedDomains: [
      "mail.google.com",
      "calendar.google.com",
      "docs.google.com",
      "drive.google.com",
      "slack.com",
      "app.slack.com",
      "web.whatsapp.com"
    ],
    focusEnabled: false,
    focusProactive: false,
    focusClusterMinutes: 10,
    focusOutTtlMinutes: 3
  };

  function $(id) {
    return document.getElementById(id);
  }
  
  async function load() {
    const stored = await chrome.storage.local.get(DEFAULTS);
  
    $("ttlMinutes").value = stored.ttlMinutes;
    $("cooldownSeconds").value = stored.cooldownSeconds;
    $("freeRamPercent").value = stored.freeRamPercent;
    $("usedRamPercent").value = stored.usedRamPercent;
    $("protectedDomains").value = (stored.protectedDomains || []).join("\n");
    $("focusEnabled").checked = stored.focusEnabled;
    $("focusProactive").checked = stored.focusProactive;
    $("focusClusterMinutes").value = stored.focusClusterMinutes;
    $("focusOutTtlMinutes").value = stored.focusOutTtlMinutes;
  }
  
  function normalizeDomains(text) {
    return text
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => s.replace(/^https?:\/\//, "").replace(/\/.*$/, "")); // keep hostname only
  }
  
  async function save() {
    const ttlMinutes = Number($("ttlMinutes").value);
    const cooldownSeconds = Number($("cooldownSeconds").value);
    const freeRamPercent = Number($("freeRamPercent").value);
    const usedRamPercent = Number($("usedRamPercent").value);
    const protectedDomains = normalizeDomains($("protectedDomains").value); 
    const focusEnabled = $("focusEnabled").checked;
    const focusProactive = $("focusProactive").checked;
    const focusClusterMinutes = Number($("focusClusterMinutes").value);
    const focusOutTtlMinutes = Number($("focusOutTtlMinutes").value);

    await chrome.storage.local.set({
      ttlMinutes,
      cooldownSeconds,
      freeRamPercent,
      usedRamPercent,
      protectedDomains, 
      focusEnabled,
      focusProactive,
      focusClusterMinutes,
      focusOutTtlMinutes
    }); 
  
    $("status").textContent = "Saved ✓";
    setTimeout(() => ($("status").textContent = ""), 1200);
  }
  
  document.addEventListener("DOMContentLoaded", load);
  $("saveBtn").addEventListener("click", save);