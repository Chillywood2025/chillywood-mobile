import {
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  invokeAccountBoundSupabaseMutationRpc,
} from "./accountBoundSupabaseMutation";
import { normalizeImageUploadFile } from "./imageUploadNormalization";
import { pickSocialAttachmentFile } from "./socialAttachmentPicker";
import { pickDeviceImage } from "./deviceImagePicker";
import {
  uploadPlatformBrandAsset,
  type PlatformBrandAssetFile,
  type PlatformBrandUploadAttempt,
} from "./platformBranding";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import type { MerchProduct } from "./creatorMerch";

export type MerchProductPhotoFile = PlatformBrandAssetFile;
export type MerchProductPhotoUploadAttempt = {
  productId?: string;
  ownerUserId?: string;
  sourceUri?: string;
  upload?: PlatformBrandUploadAttempt;
};
export type MerchPhotoFields = {
  photoAssetId?: string | null;
  photoStatus?: "none" | "pending_review" | "ready" | "blocked";
  photoStoragePath?: string | null;
  photoUrl?: string | null;
  photoCanApprove?: boolean;
  photoScanStatus?: string | null;
};

export function pickMerchProductPhoto(source: "photos" | "files" = "photos"): Promise<MerchProductPhotoFile | null> {
  return source === "files" ? pickDeviceImage("files") : pickSocialAttachmentFile("images");
}

// Staging never edits a product or its revision. Keep attempt in the initiating
// screen only: a lost acknowledgement is retried against the same asset ID.
export async function uploadMerchProductPhoto(input: {
  ownerUserId: string; productId: string; file: MerchProductPhotoFile;
  attempt?: MerchProductPhotoUploadAttempt; assertOperationCurrent?: () => void;
}) {
  if (!input.productId || !input.ownerUserId) throw new Error("Save a product draft before choosing a photo.");
  const subject = await captureAccountBoundSupabaseMutationSubject(input.ownerUserId);
  const current = () => {
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    input.assertOperationCurrent?.();
  };
  current();
  const attempt = input.attempt ?? {};
  if (attempt.sourceUri && (attempt.sourceUri !== input.file.uri
    || attempt.productId !== input.productId || attempt.ownerUserId !== input.ownerUserId)) {
    throw new Error("Retry the same photo before choosing a replacement.");
  }
  // Check the owned saved product before allocating bytes. The server repeats
  // this authority at binding; a draft disappearing meanwhile never publishes.
  const check = await invokeAccountBoundSupabaseMutationRpc(subject, "check_creator_merch_photo_target", {
    p_product_id: input.productId,
  });
  current();
  if (check.error || check.data !== true) throw new Error("Photo upload access is unavailable. It requires current Premium creator-tool access and your own saved product.");
  attempt.productId = input.productId; attempt.ownerUserId = input.ownerUserId;
  attempt.sourceUri = input.file.uri; attempt.upload ??= {};
  const normalized = await normalizeImageUploadFile(input.file);
  try {
    current();
    // The upload helper's retry identity uses the original selection, while
    // conversion may create a different temporary URI on each attempt.
    if (attempt.upload.payload) attempt.upload.fileUri = normalized.file.uri;
    const asset = await uploadPlatformBrandAsset({
      ownerUserId: input.ownerUserId, assetType: "merch_product_image",
      file: normalized.file, attempt: attempt.upload,
      accessToken: subject.accessToken, assertOperationCurrent: current,
    });
    current();
    const blocked = asset.deletedAt || asset.quarantinedAt
      || ["malware_detected", "scan_failed", "quarantined"].includes(asset.scanStatus)
      || ["hidden", "removed", "rejected"].includes(asset.moderationStatus);
    const status: "blocked" | "ready" | "pending_review" = blocked ? "blocked"
      : asset.scanStatus === "clean" && ["clean", "reported"].includes(asset.moderationStatus)
        ? "ready" : "pending_review";
    return { assetId: asset.id, previewUrl: input.file.uri, status };
  } finally { await normalized.cleanup(); }
}

export async function assignMerchProductPhoto(input: {
  ownerUserId: string; productId: string; assetId: string | null; expectedUpdatedAt: string;
}): Promise<MerchProduct & MerchPhotoFields> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.ownerUserId);
  const result = await invokeAccountBoundSupabaseMutationRpc<MerchProduct & MerchPhotoFields>(subject,
    "assign_merch_product_photo", { p_product_id: input.productId, p_asset_id: input.assetId,
      p_expected_updated_at: input.expectedUpdatedAt });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (result.error?.code === "55P03") {
    throw new Error("Your shop is processing another change. Your photo selection is kept; try Use this photo again.");
  }
  if (result.error || !result.data || result.data.id !== input.productId) {
    throw new Error("The photo change could not be confirmed. Reload the product before trying again.");
  }
  return result.data;
}

export async function discardMerchProductPhoto(input: { ownerUserId: string; assetId: string }): Promise<void> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.ownerUserId);
  const result = await invokeAccountBoundSupabaseMutationRpc<{ assetId: string; deletedAt: string }>(subject,
    "discard_creator_merch_photo", { p_asset_id: input.assetId });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (result.error || result.data?.assetId !== input.assetId || !result.data.deletedAt) {
    throw new Error("Photo removal could not be confirmed. Retry the same photo removal.");
  }
}

export async function approveMerchProductPhoto(input: {
  ownerUserId: string; productId: string; assetId: string; expectedUpdatedAt: string;
}): Promise<MerchProduct & MerchPhotoFields> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.ownerUserId);
  const result = await invokeAccountBoundSupabaseMutationRpc<MerchProduct & MerchPhotoFields>(subject,
    "approve_creator_merch_photo", { p_product_id: input.productId, p_asset_id: input.assetId,
      p_expected_updated_at: input.expectedUpdatedAt });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (result.error?.code === "55P03") throw new Error("Your shop is busy. Refresh the photo status and try approval again.");
  if (result.error || result.data?.id !== input.productId || result.data.photoAssetId !== input.assetId) {
    throw new Error("This photo cannot be approved yet. Refresh its safety status before trying again.");
  }
  return result.data;
}

export async function readMerchProductPhotoStatus(input: {
  ownerUserId: string; productId: string;
}): Promise<MerchProduct & MerchPhotoFields> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.ownerUserId);
  const result = await invokeAccountBoundSupabaseMutationRpc<MerchProduct & MerchPhotoFields>(subject,
    "read_creator_merch_photo_status", { p_product_id: input.productId });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (result.error || result.data?.id !== input.productId) throw new Error("Photo status could not be refreshed. Try again.");
  return result.data;
}

// Signed URLs are display-only and bounded to five minutes. Never write them
// into image_url or any catalog field. Storage RLS rechecks product visibility.
export async function resolveMerchProductPhotos<T extends MerchPhotoFields>(products: T[]): Promise<T[]> {
  if (!products.some((product) => product.photoStoragePath)) return products;
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const origin = SUPABASE_URL.replace(/\/+$/, "");
  const resolved = await Promise.all(products.map(async (product) => {
    if (!product.photoStoragePath) return { ...product, photoUrl: null };
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    const path = product.photoStoragePath.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${origin}/storage/v1/object/sign/platform-brand-assets/${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${subject.accessToken}`, apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }),
    }).catch(() => null);
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    const body = response?.ok ? await response.json().catch(() => null) : null;
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    const signed = typeof body?.signedURL === "string" ? body.signedURL : "";
    // Do not follow unexpected origins returned by a malformed adapter.
    const photoUrl = signed.startsWith("/object/sign/platform-brand-assets/")
      ? `${origin}/storage/v1${signed}` : null;
    return { ...product, photoUrl };
  }));
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return resolved;
}
