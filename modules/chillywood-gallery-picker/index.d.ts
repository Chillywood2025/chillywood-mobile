type GalleryKind = "image" | "video";
export type GalleryCapability = { apiVersion: 1; available: boolean; maximumSelection: 1; localOnly: false; reason?: string };
export type GallerySelection = { canceled: true } | { canceled: false; selectionId: string; asset: {
  uri: string; name?: string; mimeType?: string; size: number;
} };
declare const module: {
  capabilities(kind: GalleryKind): GalleryCapability;
  launchGalleryAsync(options: { requestId: string; mediaKind: GalleryKind; maximumBytes: number; heicMaximumBytes?: number }): Promise<GallerySelection>;
  cancelRequestAsync(requestId: string): Promise<void>;
  discardSelectionAsync(selectionId: string): Promise<void>;
} | null;
export default module;
