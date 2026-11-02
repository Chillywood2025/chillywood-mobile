import { useCallback, useLayoutEffect, useRef, useState, type SetStateAction } from "react";
import { releasePickedMedia, retainPickedMedia } from "../_lib/mediaPickerResources";

type OwnedValue = { files: unknown; drop: () => void };
const retire = (owner: OwnedValue) => { void releasePickedMedia(owner.files); owner.drop(); };

/** Explicit file ownership for staged UI state. The resolver names exact file
 * identities (or arrays of them); it never infers ownership from URI strings.
 * Acquire synchronously before a send's finally can drop its lease, and retire
 * the prior UI owner only after the replacement has committed. In particular,
 * a cleared composer can safely hand its file to a recovery card in one turn.
 */
export function useOwnedPickedMediaState<T>(initialValue: T, files: (value: T) => unknown = (value) => value) {
  const [value, setValue] = useState(initialValue);
  const current = useRef(value);
  const resolve = useRef(files);
  resolve.current = files;
  const owner = useRef<OwnedValue | null>(null);
  const retired = useRef<OwnedValue[]>([]);
  const mounted = useRef(true);
  const setOwnedValue = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function" ? (action as (previous: T) => T)(current.current) : action;
    if (Object.is(next, current.current)) return;
    const nextFiles = resolve.current(next);
    if (!mounted.current) { void releasePickedMedia(nextFiles); return; }
    const nextOwner = { files: nextFiles, drop: retainPickedMedia(nextFiles) };
    if (owner.current) retired.current.push(owner.current);
    owner.current = nextOwner;
    current.current = next;
    setValue(next);
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    const pendingRetirements = retired.current;
    if (!owner.current) {
      const selected = resolve.current(current.current);
      owner.current = { files: selected, drop: retainPickedMedia(selected) };
    }
    return () => {
      mounted.current = false;
      // Strict Mode replays effects without retiring the component's state.
      // A real unmount stays inactive through this microtask.
      void Promise.resolve().then(() => {
        if (mounted.current) return;
        if (owner.current) retire(owner.current);
        owner.current = null;
        pendingRetirements.splice(0).forEach(retire);
      });
    };
  }, []);
  useLayoutEffect(() => {
    // An urgent unrelated commit can still show the old value while a lower
    // priority replacement is suspended. Only that replacement's committed
    // state may retire its predecessors, not just any intervening render.
    if (Object.is(value, current.current)) retired.current.splice(0).forEach(retire);
  });
  return [value, setOwnedValue] as const;
}
