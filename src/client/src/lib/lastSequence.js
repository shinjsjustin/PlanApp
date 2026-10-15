const keyFor = (projectId) => `planapp:lastSequence:${projectId}`;

// Storage access can throw (Safari private mode), so failures are non-fatal.
export function readLastSequence(projectId) {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSequence(projectId, sequenceId) {
  try {
    localStorage.setItem(keyFor(projectId), String(sequenceId));
  } catch {
    // Remembering the last sequence is best-effort.
  }
}
