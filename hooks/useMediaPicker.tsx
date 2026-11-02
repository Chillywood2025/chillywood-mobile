import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority,
} from "../_lib/accountSessionAuthority";
import { acquireMediaPickerSession, runMediaPickerSelection, type MediaPickerSource, type MediaPickerOperation } from "../_lib/mediaPickerCoordinator";
import { MediaSourceSheet } from "../components/ui/MediaSourceSheet";
import { getDeviceGalleryCapability } from "../_lib/deviceGalleryPicker";
import { releasePickedMedia } from "../_lib/mediaPickerResources";

export type { MediaPickerSource, MediaPickerOperation } from "../_lib/mediaPickerCoordinator";

/** Keep the Modal mounted, set visible=false, and forward its onDismiss here.
 * iOS never substitutes a timer/frame for native dismissal. Android's RN Modal
 * has no onDismiss callback; use animationType="none" and a post-commit frame.
 */
export function useMediaPickerModalDismissal(visible: boolean, identity?: unknown) {
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const pending = useRef<{ promise: Promise<void>; resolve: () => void; identity: unknown } | null>(null);
  const onDismiss = useCallback(() => {
    const current = pending.current;
    if (!current || current.identity !== identity) return;
    pending.current = null; current.resolve();
  }, [identity]);
  const waitForDismissal = useCallback(() => {
    if (pending.current) return pending.current.promise;
    if (!visibleRef.current) return Promise.resolve();
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    pending.current = { promise, resolve, identity: identityRef.current };
    return promise;
  }, []);
  useEffect(() => {
    if (visible || Platform.OS === "ios" || !pending.current) return;
    const frame = requestAnimationFrame(onDismiss);
    return () => cancelAnimationFrame(frame);
  }, [visible, onDismiss]);
  useEffect(() => onDismiss, [onDismiss]);
  return { waitForDismissal, onDismiss };
}

export type MediaPickerRequest<T> = {
  title?: string;
  sources?: MediaPickerSource[];
  mediaKind?: "image" | "video" | "attachment";
  /** Inline only when the host sits beside Attach inside a scrolling form. */
  preparingPlacement?: "screen" | "inline";
  /** Preserve multi-item flows; single-item-only native sources must be omitted. */
  multiple?: boolean;
  isCurrent?: () => boolean;
  /** Only anonymous evidence/report forms should enable this. */
  allowUnauthenticated?: boolean;
  /** Close another native Modal using its real dismissal callback first. */
  beforePresent?: () => Promise<void>;
  /** Only an already-started native presentation with an immutable logical
   * intent and mandatory post-return canonical validation may opt in. */
  retainNativeResultWhileHidden?: () => boolean;
  advancedAction?: { label: string; onPress: () => void };
  pick: (source: MediaPickerSource, operation: MediaPickerOperation) => Promise<T | null>;
};

type Choice = MediaPickerSource | "advanced" | null;
type ActiveRequest = {
  id: number;
  retired: boolean;
  choosing: boolean;
  isCurrent: () => boolean;
  resolveChoice: (source: Choice) => void;
  retainNativeResultWhileHidden?: () => boolean;
};
type SheetState = {
  id: number;
  visible: boolean; title: string; sources: MediaPickerSource[];
  mediaKind?: "image" | "video" | "attachment"; advancedLabel?: string;
  preparingPlacement?: "screen" | "inline";
};

/** Selects only; callers retain their validation, staging, moderation and save action. */
export function useMediaPicker(targetKey: string) {
  const mounted = useRef(true);
  const target = useRef({ key: targetKey, generation: 0 });
  if (target.current.key !== targetKey) target.current = { key: targetKey, generation: target.current.generation + 1 };
  const active = useRef<ActiveRequest | null>(null);
  const requestGeneration = useRef(0);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [preparingRequestId, setPreparingRequestId] = useState<number | null>(null);
  const { waitForDismissal, onDismiss } = useMediaPickerModalDismissal(sheet?.visible ?? false, sheet?.id);

  const close = useCallback((choice: Choice) => {
    const request = active.current;
    if (!request || !request.choosing) return;
    request.choosing = false;
    const dismissed = waitForDismissal();
    if (mounted.current) setSheet((current) => current ? { ...current, visible: false } : null);
    void dismissed.then(() => request.resolveChoice(choice));
  }, [waitForDismissal]);
  const cancelMediaPicker = useCallback(() => {
    if (active.current) {
      const id = active.current.id;
      active.current.retired = true;
      if (mounted.current) setPreparingRequestId((current) => current === id ? null : current);
    }
    close(null);
  }, [close]);
  const retireHiddenSheet = useCallback((id?: number) => {
    const request = active.current;
    if (!request || request.id !== id) return;
    if (!request.choosing && request.isCurrent() && request.retainNativeResultWhileHidden?.()) return;
    // An auth/loading early-return may remove the sheet without unmounting its
    // hook. Native onDismiss cannot be relied on after removal from the tree.
    // Retire without launching; if native already began, its promise still owns
    // the lease and finally is the only place that releases it.
    request.retired = true;
    if (mounted.current) setPreparingRequestId((current) => current === request.id ? null : current);
    request.resolveChoice(null);
  }, []);
  const onSheetUnmount = useCallback(() => retireHiddenSheet(sheet?.id), [retireHiddenSheet, sheet?.id]);

  useLayoutEffect(() => {
    if (active.current && !active.current.isCurrent()) cancelMediaPicker();
  }, [targetKey, cancelMediaPicker]);
  useEffect(() => {
    mounted.current = true;
    let observed = getCurrentAccountSessionAuthoritySnapshot();
    const unsubscribe = subscribeToAccountSessionAuthority((next) => {
      const unchanged = (!observed && !next) || sameAccountSessionAuthority(observed, next);
      observed = next;
      // A transient sign-out permanently retires the old operation even if an
      // equivalent snapshot is republished before its native promise settles.
      if (!unchanged) cancelMediaPicker();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      if (active.current) {
        active.current.retired = true;
        active.current.resolveChoice(null);
      }
      // Do not release global ownership here: an open native picker still owns it.
    };
  }, [cancelMediaPicker]);

  const pickMedia = useCallback(async <T,>(options: MediaPickerRequest<T>): Promise<T | null> => {
    if (!mounted.current || active.current) return null;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    if ((!authority && !options.allowUnauthenticated) || authority?.restoreOnly) return null;
    const release = acquireMediaPickerSession();
    if (!release) return null;
    const generation = target.current.generation;
    const request: ActiveRequest = { id: ++requestGeneration.current, retired: false, choosing: false, isCurrent: () => false, resolveChoice: () => undefined,
      retainNativeResultWhileHidden: options.retainNativeResultWhileHidden };
    const isCurrent = () => mounted.current && active.current === request && !request.retired
      && generation === target.current.generation
      && (authority ? sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) : !getCurrentAccountSessionAuthoritySnapshot())
      && (options.isCurrent?.() ?? true);
    request.isCurrent = isCurrent;
    active.current = request;
    try {
      if (!isCurrent()) return null;
      await options.beforePresent?.();
      if (!isCurrent()) return null;
      const gallery = await getDeviceGalleryCapability(options.mediaKind === "video" ? "video" : "image");
      if (!isCurrent()) return null;
      const requestedSources = options.sources ?? ["photos", "camera", "files"] as MediaPickerSource[];
      const sources = [...new Set([
        ...(gallery.available && !options.multiple && requestedSources.includes("photos") ? ["gallery" as const] : []), ...requestedSources,
      ])].filter((source) => !(source === "camera" && options.mediaKind === "video") && !(source === "gallery" && (!gallery.available || options.multiple)));
      const selection = new Promise<Choice>((resolve) => { request.resolveChoice = resolve; });
      request.choosing = true;
      setSheet({ id: request.id, visible: true, title: options.title ?? "Add an attachment", sources, mediaKind: options.mediaKind, preparingPlacement: options.preparingPlacement, advancedLabel: options.advancedAction?.label });
      const choice = await selection;
      if (!choice || !isCurrent()) return null;
      if (choice === "advanced") { options.advancedAction?.onPress(); return null; }
      if (!sources.includes(choice)) return null;
      // The source Modal has really dismissed. Native selection/cloud import
      // may still be pending; feedback does not release or replace its lease.
      setPreparingRequestId(request.id);
      const result = await runMediaPickerSelection(isCurrent, (operation) => options.pick(choice, operation));
      if (!isCurrent()) { await releasePickedMedia(result); return null; }
      return result;
    } catch (error) {
      if (isCurrent()) throw error;
      return null;
    } finally {
      if (active.current === request) {
        active.current = null;
        if (mounted.current) {
          setSheet(null);
          setPreparingRequestId((current) => current === request.id ? null : current);
        }
      }
      release();
    }
  }, []);

  const preparing = !!sheet && preparingRequestId === sheet.id && !sheet.visible && !!active.current?.isCurrent();
  const mediaPickerSheet = sheet ? <MediaSourceSheet {...sheet} preparing={preparing} onDismiss={onDismiss} onUnmount={onSheetUnmount}
    onCancel={cancelMediaPicker} onChoose={(source) => {
      if (active.current?.isCurrent()) close(source); else cancelMediaPicker();
    }} /> : null;
  return { pickMedia, mediaPickerSheet, cancelMediaPicker };
}
