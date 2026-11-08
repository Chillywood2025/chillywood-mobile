import { Platform } from "react-native";
import { pickDeviceAttachments } from "./deviceAttachmentPicker";
import type { MediaPickerOperation, MediaPickerSource } from "./mediaPickerCoordinator";
import { releasePickedMedia, withPickedMediaRead } from "./mediaPickerResources";
import { File } from "expo-file-system";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { PAID_VIDEO_PROFILE } from "./isolatedPaidVideo";

export type PaidVideoFileExpectation = Readonly<{ name: string; expectedByteLength: number; expectedSha256: string }>;
export type PaidVideoFileLease = Readonly<{ expectation: PaidVideoFileExpectation; takeBytes(): Uint8Array<ArrayBuffer>; dispose(): void }>;
export type PaidVideoFileSelection = (choose: (source: MediaPickerSource, operation: MediaPickerOperation) => Promise<PaidVideoFileLease | null>) => Promise<PaidVideoFileLease | null>;
export class PaidVideoFileError extends Error {
  constructor(readonly code: "authority_retired" | "native_unavailable" | "invalid_file" | "selection_busy") { super(`Paid Video file: ${code}.`); }
}

/** A local file is an untrusted expectation. This owner retains a bounded byte
 * snapshot and never returns a storage URL or scan/publication authority.
 * Native/server full-byte verification is still required before publication. */
export function capturePaidVideoFilePicker(authority: AccountSessionAuthorityBinding) {
  const expected = Object.freeze({ ...authority }); let retired = false, selecting = false;
  const leases = new Set<{ wipe(): void }>();
  const retire = () => { retired = true; for (const lease of leases) lease.wipe(); leases.clear(); };
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retire(); });
  const current = () => {
    if (retired || expected.restoreOnly || expected.userId !== expected.accountId || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) {
      retire(); throw new PaidVideoFileError("authority_retired");
    }
  };
  return Object.freeze({ dispose() { retire(); unsubscribe(); },
    async choose(source: MediaPickerSource, operation: MediaPickerOperation): Promise<PaidVideoFileLease | null> {
      current(); if (selecting) throw new PaidVideoFileError("selection_busy");
      if (Platform.OS !== "ios" && Platform.OS !== "android") throw new PaidVideoFileError("native_unavailable");
      const selectionCurrent = () => { current(); if (!operation?.isCurrent()) throw new PaidVideoFileError("authority_retired"); };
      selectionCurrent();
      selecting = true; let bytes: Uint8Array<ArrayBuffer> | null = null;
      let assets: Awaited<ReturnType<typeof pickDeviceAttachments>> = null;
      try {
        // Lazy import keeps an older installed native app from crashing merely
        // by importing this route. Missing ExpoCrypto fails this explicit action.
        let crypto: typeof import("expo-crypto");
        try { crypto = await import("expo-crypto"); } catch { throw new PaidVideoFileError("native_unavailable"); }
        selectionCurrent();
        assets = await pickDeviceAttachments(source, { mimeTypes: ["video/mp4"], mediaKind: "video", multiple: false,
          selectionLimit: 1, maximumBytes: PAID_VIDEO_PROFILE.maxBytes, operation }); selectionCurrent();
        if (!assets) return null;
        const asset = assets[0];
        if (!asset || assets.length !== 1 || typeof asset.name !== "string" || !/\.mp4$/iu.test(asset.name)
          || asset.name.length > 255 || (asset.mimeType != null && asset.mimeType !== "video/mp4") || !asset.uri.startsWith("file:")) throw new PaidVideoFileError("invalid_file");
        const file = new File(asset.uri);
        const expectedLength = file.size;
        if (!file.exists || !Number.isSafeInteger(expectedLength) || expectedLength < 1 || expectedLength > PAID_VIDEO_PROFILE.maxBytes
          || (asset.size !== undefined && asset.size !== expectedLength)) throw new PaidVideoFileError("invalid_file");
        selectionCurrent(); bytes = new Uint8Array(await withPickedMediaRead(asset.uri, () => file.arrayBuffer())); selectionCurrent();
        if (bytes.byteLength !== expectedLength || file.size !== expectedLength) throw new PaidVideoFileError("invalid_file");
        const digest = new Uint8Array(await crypto.digest(crypto.CryptoDigestAlgorithm.SHA256, bytes)); selectionCurrent();
        if (digest.byteLength !== 32) throw new PaidVideoFileError("native_unavailable");
        const expectation: PaidVideoFileExpectation = Object.freeze({ name: asset.name, expectedByteLength: bytes.byteLength,
          expectedSha256: Array.from(digest, n => n.toString(16).padStart(2, "0")).join("") });
        for (const previous of leases) previous.wipe(); leases.clear();
        let snapshot: Uint8Array<ArrayBuffer> | null = bytes; bytes = null;
        const owner = { wipe() { snapshot?.fill(0); snapshot = null; } }; leases.add(owner);
        const lease = Object.freeze({ expectation,
          takeBytes() { current(); if (!snapshot) throw new PaidVideoFileError("invalid_file");
            const body = snapshot.slice(); owner.wipe(); leases.delete(owner); return body; },
          dispose() { owner.wipe(); leases.delete(owner); },
        });
        operation.ownResource(lease, async () => lease.dispose());
        return lease;
      } catch (error) {
        bytes?.fill(0); current(); if (error instanceof PaidVideoFileError) throw error;
        throw new PaidVideoFileError("invalid_file");
      } finally { selecting = false; await releasePickedMedia(assets); }
    },
  });
}
