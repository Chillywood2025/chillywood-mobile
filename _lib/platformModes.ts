export type PublicPlatformMode =
  | "owner_mode"
  | "viewer_mode"
  | "sandbox_tester_mode"
  | "public_preview_mode"
  | "owner_preview_as_viewer_mode";

export const resolvePublicPlatformMode = (input: {
  isOwner: boolean;
  sandboxTesterActive?: boolean;
  publicPreviewMode?: boolean;
  ownerPreviewAsViewerMode?: boolean;
}): PublicPlatformMode => {
  if (input.ownerPreviewAsViewerMode && input.isOwner) return "owner_preview_as_viewer_mode";
  if (input.publicPreviewMode) return "public_preview_mode";
  if (input.isOwner) return "owner_mode";
  if (input.sandboxTesterActive) return "sandbox_tester_mode";
  return "viewer_mode";
};

export const isOwnerPlatformMode = (mode: PublicPlatformMode) =>
  mode === "owner_mode";

export const isViewerPurchasePlatformMode = (mode: PublicPlatformMode) =>
  mode === "viewer_mode" || mode === "sandbox_tester_mode";

