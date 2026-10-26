type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

// Supabase's password/OTP sign-in saves are not protected by its auth lock.
// Serialize storage mutations with conditional cleanup, including the event,
// so a replacement session is either saved after SIGNED_OUT or left intact.
type MutationLock = <T>(operation: () => Promise<T>) => Promise<T>;
export function createAccountSessionStorage(backing: SessionStorage, lock: MutationLock = operation => operation()) {
  let tail: Promise<unknown> = Promise.resolve();
  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const pending = tail.then(() => lock(operation), () => lock(operation));
    tail = pending.then(() => undefined, () => undefined);
    return pending;
  }
  return {
    readSession(key: string) {
      return mutate(async () => {
        const raw = await backing.getItem(key);
        try { return raw ? JSON.parse(raw) as unknown : null; } catch { return null; }
      });
    },
    storage: {
      getItem: (key: string) => backing.getItem(key),
      setItem: (key: string, value: string) => mutate(async () => { await backing.setItem(key, value); }),
      removeItem: (key: string) => mutate(async () => { await backing.removeItem(key); }),
    },
    removeSessionIf(key: string, matches: (value: unknown) => boolean, onRemoved: () => Promise<void>) {
      return mutate(async () => {
        const raw = await backing.getItem(key);
        let value: unknown;
        try { value = raw ? JSON.parse(raw) : null; } catch { return false; }
        if (!matches(value)) return false;
        await backing.removeItem(key);
        await backing.removeItem(`${key}-code-verifier`);
        await backing.removeItem(`${key}-user`);
        await onRemoved();
        return true;
      });
    },
  };
}

type AuthEventClient = {
  _notifyAllSubscribers(event: string, session: unknown, broadcast?: boolean): Promise<void>;
};

// A BroadcastChannel SIGNED_OUT message carries no initiating identity. Ignore
// delayed messages once a new local session exists, before both the app and
// Supabase's own realtime subscriber can consume them. The event revision also
// handles a local SIGNED_IN arriving during the asynchronous storage read.
export function guardAccountSessionSignOutEvents(client: unknown, storage: Pick<SessionStorage, "getItem">, key: string) {
  const auth = client as AuthEventClient;
  const notify = auth._notifyAllSubscribers.bind(auth);
  let revision = 0;
  auth._notifyAllSubscribers = async (event, session, broadcast = true) => {
    const expectedRevision = ++revision;
    if (event === "SIGNED_OUT") {
      const raw = await storage.getItem(key);
      if (revision !== expectedRevision) return;
      try {
        const current = raw ? JSON.parse(raw) : null;
        if (typeof current?.access_token === "string" && typeof current?.user?.id === "string") return;
      } catch { /* Malformed storage is not a replacement session. */ }
    }
    await notify(event, session, broadcast);
  };
}
