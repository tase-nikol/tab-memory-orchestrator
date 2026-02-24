export const DEFAULT_SETTINGS = {
    ttlMinutes: 15,
    cooldownSeconds: 60,
    freeRamPercent: 12,
    usedRamPercent: 85,
    protectedDomains: [],
  
    // Focus Mode
    focusEnabled: false,
    focusProactive: false,
    focusClusterMinutes: 10,
    focusOutTtlMinutes: 3
  };
  
  export async function loadSettings(currentSettings) {
    const defaults = { ...DEFAULT_SETTINGS, ...currentSettings };
    const stored = await chrome.storage.local.get(defaults);
  
    return {
      settings: stored,
      protectedDomainsSet: new Set(stored.protectedDomains || [])
    };
  }
  
  export function ttlMsNormal(settings) {
    return Math.max(1, settings.ttlMinutes) * 60_000;
  }
  
  export function ttlMsFocusOut(settings) {
    return Math.max(1, settings.focusOutTtlMinutes) * 60_000;
  }
  
  export function cooldownMs(settings) {
    return Math.max(10, settings.cooldownSeconds) * 1000;
  }
  
  export function clusterWindowMs(settings) {
    return Math.max(1, settings.focusClusterMinutes) * 60_000;
  }