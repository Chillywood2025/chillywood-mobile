import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../_lib/accountSessionAuthority";

export type AdminHistoryPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

// A continuation belongs to the exact account, filter and cursor that produced
// it. Refreshes retire older requests; rapid Load More clicks share one latch.
export function useAdminHistoryRead<T>(scope: string | null, storedItems: T[], setItems: (items: T[]) => void, keyOf: (item: T) => string, expectedSession: AccountSessionAuthorityBinding | null) {
  const [state, setState] = useState<{ scope: string | null; page: AdminHistoryPage<T> | null; loading: boolean; error: string | null }>({ scope: null, page: null, loading: false, error: null });
  const authorityRef = useRef(scope);
  authorityRef.current = scope;
  const expectedSessionRef = useRef(expectedSession);
  expectedSessionRef.current = expectedSession;
  const requestRef = useRef(0);
  const pageRef = useRef<{ scope: string | null; page: AdminHistoryPage<T> | null; busy: boolean }>({ scope: null, page: null, busy: false });
  if (pageRef.current.scope !== scope) pageRef.current = { scope, page: null, busy: false };
  useEffect(() => {
    const lifecycle = requestRef;
    setItems([]);
    setState({ scope, page: null, loading: false, error: null });
    return () => { lifecycle.current++; };
  }, [scope, setItems]);
  const load = useCallback(async (read: (cursor: string | null) => Promise<AdminHistoryPage<T>>, append = false) => {
    const session = getCurrentAccountSessionAuthoritySnapshot();
    if (!scope || authorityRef.current !== scope || !session || session.restoreOnly
      || !sameAccountSessionAuthority(expectedSessionRef.current, session)) return;
    const previous = pageRef.current;
    if (append && (previous.busy || previous.scope !== scope || !previous.page?.hasMore || !previous.page.nextCursor)) return;
    const cursor = append ? previous.page!.nextCursor : null;
    const generation = ++requestRef.current;
    const active = { scope, page: append ? previous.page : null, busy: true };
    pageRef.current = active;
    const isCurrent = () => requestRef.current === generation && authorityRef.current === scope
      && pageRef.current === active && sameAccountSessionAuthority(session, getCurrentAccountSessionAuthoritySnapshot());
    if (!append) setItems([]);
    setState({ scope, page: active.page, loading: true, error: null });
    try {
      const page = await read(cursor);
      if (!isCurrent()) return;
      if (!Array.isArray(page.items) || typeof page.hasMore !== "boolean"
        || (page.hasMore ? typeof page.nextCursor !== "string" || !page.nextCursor || page.nextCursor === cursor : page.nextCursor !== null)) {
        throw new Error("History page did not advance. Refresh before loading more.");
      }
      const items = Array.from(new Map([...(append ? previous.page!.items : []), ...page.items].map((item) => [keyOf(item), item])).values());
      const merged = { ...page, items };
      active.page = merged;
      active.busy = false;
      setItems(items);
      setState({ scope, page: merged, loading: false, error: null });
    } catch (error) {
      if (!isCurrent()) return;
      active.busy = false;
      setState({ scope, page: active.page, loading: false, error: error instanceof Error ? error.message : "History is unavailable. Try again." });
    }
  }, [scope, setItems, keyOf]);
  return {
    items: state.scope === scope && scope ? storedItems : [],
    page: state.scope === scope ? state.page : null,
    loading: state.scope === scope && state.loading,
    error: state.scope === scope ? state.error : null,
    load,
  };
}
