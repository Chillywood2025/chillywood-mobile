type CaptureTrack = { enabled: boolean; readyState: string; stop: () => void };
type OwnedCapture = { owner: object; retired: boolean; tracks: CaptureTrack[] | null };

// Process-owned because native capture can finish after the React hook unmounts.
// Retain adopted capture too: hook-local cleanup cannot erase an unproved stop
// when the component unmounts. Only retired records block new acquisition;
// fully ended records are pruned without touching another owner's tracks.
const ownedCaptures = new Set<OwnedCapture>();

function pruneEndedCaptures() {
  for (const record of ownedCaptures) {
    if (record.tracks !== null && record.tracks.every((track) => String(track.readyState).toLowerCase() === "ended")) {
      ownedCaptures.delete(record);
    }
  }
}

function dispose(record: OwnedCapture): boolean {
  if (record.tracks === null) return false;
  for (const track of record.tracks) {
    try { track.enabled = false; } catch { /* Inspect stop below. */ }
    try { track.stop(); } catch { /* Keep the record for an explicit retry. */ }
  }
  const stopped = record.tracks.every((track) => String(track.readyState).toLowerCase() === "ended");
  if (stopped) ownedCaptures.delete(record);
  return stopped;
}

export function reserveCommunicationCapture(owner: object) {
  pruneEndedCaptures();
  const record: OwnedCapture = { owner, retired: false, tracks: null };
  ownedCaptures.add(record);
  return {
    received(tracks: CaptureTrack[]) {
      record.tracks = [...tracks];
      if (record.retired) { dispose(record); return false; }
      return true;
    },
    rejected() {
      // Rejection delivered no track; an earlier native success must instead
      // go through received()/retire(), never be discarded as a rejection.
      if (record.tracks === null) { record.tracks = []; ownedCaptures.delete(record); }
    },
    adopt() {
      if (record.retired || record.tracks === null) return false;
      pruneEndedCaptures();
      return ownedCaptures.has(record);
    },
    retire() {
      record.retired = true;
      ownedCaptures.add(record);
      return dispose(record);
    },
  };
}

export function retireCommunicationCaptures(owner: object): boolean {
  pruneEndedCaptures();
  let proved = true;
  for (const record of [...ownedCaptures]) {
    if (record.owner !== owner) continue;
    record.retired = true;
    proved = dispose(record) && proved;
  }
  return proved;
}

export function retryRetiredCommunicationCaptures(): boolean {
  pruneEndedCaptures();
  let proved = true;
  for (const record of [...ownedCaptures]) {
    if (record.retired) proved = dispose(record) && proved;
  }
  return proved;
}
