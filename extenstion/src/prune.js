import { getCandidates } from "./candidates.js";

function recordDiscard(appState, title) {
  const now = Date.now();
  appState.lastDiscardedInfo = title;

  appState.discardedHistory.unshift({ title, time: now });
  if (appState.discardedHistory.length > appState.MAX_HISTORY) {
    appState.discardedHistory.pop();
  }
}

export async function pruneOneTab(appState, now) {
  const candidates = await getCandidates(appState, now, 1);
  if (candidates.length === 0) {
    console.log("No eligible tabs to discard (TTL/Focus gate likely blocking).");
    return;
  }

  const target = candidates[0];
  console.log(
    `Discarding: [${target.id}] ${target.title} | inCluster=${target.inCluster} | inactive ${(target.inactiveMs / 60000).toFixed(1)}m`
  );

  await chrome.tabs.discard(target.id);
  recordDiscard(appState, target.title);
}

export async function pruneBatch(appState, now, maxCount) {
  const candidates = await getCandidates(appState, now, maxCount);
  if (candidates.length === 0) {
    console.log("No eligible tabs to discard in batch.");
    return;
  }

  for (const target of candidates) {
    console.log(
      `Batch discard: ${target.title} | inCluster=${target.inCluster} | inactive ${(target.inactiveMs / 60000).toFixed(1)}m`
    );
    await chrome.tabs.discard(target.id);
    recordDiscard(appState, target.title);
  }
}