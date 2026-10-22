import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  subscribeToAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "../_lib/accountSessionAuthority";

type ReadOwner = {
  scope: string | null;
  session: AccountSessionAuthorityBinding | null;
  generation: number;
  mounted: boolean;
  retired: boolean;
};
const activeSession = (expected: AccountSessionAuthorityBinding | null, current: AccountSessionAuthorityBinding | null) =>
  !!expected && !expected.restoreOnly && sameAccountSessionAuthority(expected, current);

/** Owns only displayed read results. It does not cancel or authorize server work. */
export function useAdminScopedRead(
  scope: string | null,
  expectedSession: AccountSessionAuthorityBinding | null,
  clear: () => void,
) {
  const ownerRef = useRef<ReadOwner | null>(null);
  const previous = ownerRef.current;
  if (!previous || previous.scope !== scope
    || (previous.session !== expectedSession && !sameAccountSessionAuthority(previous.session, expectedSession))
    || (previous.retired && scope && activeSession(expectedSession, getCurrentAccountSessionAuthoritySnapshot()))) {
    ownerRef.current = { scope, session: expectedSession, generation: 0, mounted: true, retired: false };
  }
  const owner = ownerRef.current!;
  const [state, setState] = useState<{ owner: ReadOwner; loading: boolean; error: string | null }>(
    { owner, loading: false, error: null },
  );
  const isCurrent = useCallback(() => !!owner.scope && ownerRef.current === owner
    && owner.mounted && !owner.retired
    && activeSession(owner.session, getCurrentAccountSessionAuthoritySnapshot()), [owner]);

  useEffect(() => {
    owner.mounted = true;
    owner.retired = false;
    clear();
    setState({ owner, loading: false, error: null });
    const unsubscribe = subscribeToAccountSessionAuthority((session) => {
      if (ownerRef.current !== owner || !owner.mounted) return;
      if (!activeSession(owner.session, session)) {
        owner.retired = true;
        owner.generation += 1;
        clear();
        setState({ owner, loading: false, error: null });
      } else if (owner.retired) {
        // Even A -> unavailable -> A creates a new owner, never revives callbacks.
        setState((current) => ({ ...current }));
      }
    });
    return () => {
      owner.mounted = false;
      owner.retired = true;
      owner.generation += 1;
      unsubscribe();
    };
  }, [clear, owner]);

  const run = useCallback(async <T,>(
    read: () => Promise<T>,
    publish: (result: T) => void,
    formatFailure: (error: unknown) => string,
  ) => {
    if (!isCurrent()) return;
    const generation = ++owner.generation;
    const current = () => isCurrent() && owner.generation === generation;
    setState({ owner, loading: true, error: null });
    try {
      const result = await read();
      if (!current()) return;
      publish(result);
      setState({ owner, loading: false, error: null });
    } catch (error) {
      if (!current()) return;
      clear();
      setState({ owner, loading: false, error: formatFailure(error) });
    }
  }, [clear, isCurrent, owner]);

  const visible = state.owner === owner && isCurrent();
  return { run, visible, loading: visible && state.loading, error: visible ? state.error : null };
}
