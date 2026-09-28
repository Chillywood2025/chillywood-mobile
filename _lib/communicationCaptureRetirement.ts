type CaptureTrack = { enabled: boolean; readyState: string; stop: () => void };
type PendingCapture = { owner: object; retired: boolean; tracks: CaptureTrack[] | null };

// Process-owned because native capture can finish after the React hook unmounts.
// Only still-pending acquisitions live here; adopted streams belong to the
// existing session cleanup, and retired records retain their exact track objects.
const pendingCaptures = new Set<PendingCapture>();

function dispose(record: PendingCapture): boolean {
  if (record.tracks === null) return false;
  for (const track of record.tracks) {
    try { track.enabled = false; } catch { /* Inspect stop below. */ }
    try { track.stop(); } catch { /* Keep the record for an explicit retry. */ }
  }
  const stopped = record.tracks.every((track) => String(track.readyState).toLowerCase() === "ended");
  if (stopped) pendingCaptures.delete(record);
  return stopped;
}

export function reserveCommunicationCapture(owner: object) {
  const record: PendingCapture = { owner, retired: false, tracks: null };
  pendingCaptures.add(record);
  return {
    received(tracks: CaptureTrack[]) {
      record.tracks = [...tracks];
      if (record.retired) { dispose(record); return false; }
      return true;
    },
    rejected() {
      // Rejection delivered no track; an earlier native success must instead
      // go through received()/retire(), never be discarded as a rejection.
      if (record.tracks === null) { record.tracks = []; pendingCaptures.delete(record); }
    },
    adopt() {
      if (record.retired || record.tracks === null) return false;
      pendingCaptures.delete(record);
      return true;
    },
    retire() {
      record.retired = true;
      pendingCaptures.add(record);
      return dispose(record);
    },
  };
}

export function retireCommunicationCaptures(owner: object): boolean {
  let proved = true;
  for (const record of [...pendingCaptures]) {
    if (record.owner !== owner) continue;
    record.retired = true;
    proved = dispose(record) && proved;
  }
  return proved;
}

export function retryRetiredCommunicationCaptures(): boolean {
  let proved = true;
  for (const record of [...pendingCaptures]) {
    if (record.retired) proved = dispose(record) && proved;
  }
  return proved;
}
