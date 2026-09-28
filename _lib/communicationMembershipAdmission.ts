type MembershipAdmissionReservation = Readonly<{
  predecessor: Promise<void> | null;
  settled: Promise<void>;
  release: () => void;
}>;

// Keep an older join and its compensating leave ahead of replacement admission,
// including component remounts or provider switches in the same process.
// The server's admission CAS separately fences ownership across app restarts;
// this queue is coordination, never a substitute for that durable generation.
const admissionTails = new Map<string, Promise<void>>();

export function reserveCommunicationMembershipAdmission(options: {
  roomId: string;
  userId: string;
}): MembershipAdmissionReservation {
  const key = JSON.stringify([options.roomId.trim().toUpperCase(), options.userId.trim()]);
  const predecessor = admissionTails.get(key) ?? null;
  let resolveSettlement: () => void = () => {};
  let released = false;
  const ownSettlement = new Promise<void>((resolve) => { resolveSettlement = resolve; });
  // Even an abandoned queued owner must remain behind its predecessor. Its
  // early release cannot let a third owner leapfrog an unresolved operation.
  const settled = predecessor ? predecessor.then(() => ownSettlement) : ownSettlement;
  admissionTails.set(key, settled);
  void settled.then(() => {
    if (admissionTails.get(key) === settled) admissionTails.delete(key);
  });
  return Object.freeze({
    predecessor,
    settled,
    release: () => {
      if (released) return;
      released = true;
      resolveSettlement();
    },
  });
}
