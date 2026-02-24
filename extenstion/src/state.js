export const appState = {
    port: null,
  
    // Activity
    tabActivity: new Map(),
  
    // Settings
    settings: {},
    protectedDomainsSet: new Set(),
  
    // Orchestrator state
    lastPruneTime: 0,
    orchestratorEnabled: true,
  
    // From native host
    lastSystemState: null,
  
    // Popup/history
    lastDiscardedInfo: null,
    discardedHistory: [],
    MAX_HISTORY: 5,
  
    // Focus stats
    lastFocusClusterSize: null
  };