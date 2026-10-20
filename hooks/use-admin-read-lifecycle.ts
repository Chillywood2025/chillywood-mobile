import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

/** UI result ownership only. RPC authorization remains enforced by the server. */
export function useAdminReadLifecycle<T extends { loading: boolean }>(
  authorityKey: string | null,
  setModel: Dispatch<SetStateAction<T>>,
  empty: T,
) {
  const owner = useRef({ authorityKey, generation: 0, mounted: true });
  // Retire results as soon as the authority changes, before passive effects run.
  if (owner.current.authorityKey !== authorityKey) {
    owner.current.authorityKey = authorityKey;
    owner.current.generation += 1;
  }
  useEffect(() => {
    const lifecycle = owner.current;
    lifecycle.mounted = true;
    setModel(empty);
    return () => {
      lifecycle.mounted = false;
      lifecycle.generation += 1;
    };
  }, [authorityKey, empty, setModel]);

  return useCallback(async (
    read: () => Promise<Omit<T, "loading">>,
    selection: Partial<T> = {},
  ) => {
    if (!authorityKey || !owner.current.mounted || owner.current.authorityKey !== authorityKey) return;
    const generation = ++owner.current.generation;
    const current = () => owner.current.mounted
      && owner.current.authorityKey === authorityKey
      && owner.current.generation === generation;
    setModel((previous) => ({ ...previous, ...selection, loading: true }));
    try {
      const model = await read();
      if (current()) setModel({ ...model, loading: false } as T);
    } catch {
      // Do not keep potentially revoked rows or leave a rejected read spinning.
      if (current()) setModel({ ...empty, ...selection, loading: false });
    }
  }, [authorityKey, empty, setModel]);
}
