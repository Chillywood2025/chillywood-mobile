export type MediaSessionStopReason = "app_background" | "sign_out" | "teardown";

type ActiveMediaSessionStopper = (reason: MediaSessionStopReason) => void | Promise<void>;

const activeMediaSessionStoppers = new Set<ActiveMediaSessionStopper>();

export const registerActiveMediaSessionStopper = (stopper: ActiveMediaSessionStopper) => {
  activeMediaSessionStoppers.add(stopper);
  return () => {
    activeMediaSessionStoppers.delete(stopper);
  };
};

export const stopActiveMediaSessions = async (reason: MediaSessionStopReason) => {
  const pending = [...activeMediaSessionStoppers].map(async (stopper) => {
    try {
      await stopper(reason);
    } catch {
      // Session teardown is best-effort; every registered session still gets a stop attempt.
    }
  });
  await Promise.allSettled(pending);
};
