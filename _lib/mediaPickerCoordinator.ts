import { bindPickedMediaResult, ownPickedMedia, releasePickedMedia } from "./mediaPickerResources";

export type MediaPickerSource = "gallery" | "photos" | "camera" | "files";
/** Identity is checked, not just this callback. Only the active sheet creates it. */
export type MediaPickerOperation = Readonly<{
  isCurrent: () => boolean;
  ownResource: (value: object, release: () => Promise<void>) => void;
}>;

let sheetOwner: symbol | null = null;
let nativeOwner: symbol | null = null;
let selectionOwner: MediaPickerOperation | null = null;

/** No queue: a second tap must not unexpectedly open another picker later. */
export function acquireMediaPickerSession(): (() => void) | null {
  if (sheetOwner || nativeOwner) return null;
  const token = Symbol("media sheet");
  sheetOwner = token;
  return () => { if (sheetOwner === token) sheetOwner = null; };
}

/** Carries the sheet's authority through lazy imports and permission prompts. */
export async function runMediaPickerSelection<T>(isCurrent: () => boolean, operation: (owner: MediaPickerOperation) => Promise<T | null>) {
  if (!sheetOwner || selectionOwner || !isCurrent()) return null;
  const selectedResources = new Set<object>();
  const owner = Object.freeze({ isCurrent, ownResource: (value: object, release: () => Promise<void>) => {
    ownPickedMedia(value, release); selectedResources.add(value);
  } });
  selectionOwner = owner;
  try {
    const result = await operation(owner);
    if (!result || !isCurrent()) {
      await Promise.all([...selectedResources].map(releasePickedMedia));
      return null;
    }
    bindPickedMediaResult(result, selectedResources);
    return result;
  } catch (error) {
    await Promise.all([...selectedResources].map(releasePickedMedia));
    throw error;
  }
  finally { if (selectionOwner === owner) selectionOwner = null; }
}

/** Never release this latch on cancellation, unmount or a timer: native must settle. */
export async function runNativeMediaPicker<T>(operation: (isCurrent: () => boolean) => Promise<T | null>, owner?: MediaPickerOperation): Promise<T | null> {
  if (nativeOwner || (sheetOwner && !owner) || (owner && selectionOwner !== owner)) return null;
  const token = Symbol("native picker");
  const isCurrent = owner?.isCurrent ?? (() => true);
  if (!isCurrent()) return null;
  nativeOwner = token;
  try {
    const value = await operation(isCurrent);
    if (!isCurrent()) { await releasePickedMedia(value); return null; }
    return value;
  } catch (error) {
    if (isCurrent()) throw error;
    return null;
  } finally { if (nativeOwner === token) nativeOwner = null; }
}
