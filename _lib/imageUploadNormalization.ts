import * as FileSystem from "expo-file-system/legacy";
import { requireOptionalNativeModule } from "expo";

import {
  IMAGE_MANIPULATOR_NATIVE_MODULE_NAME,
  IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE,
  resolveImageManipulatorRuntime,
} from "./imageManipulatorNativeBoundary.mjs";
import { isHeicOrHeifImage, type ImageUploadFile } from "./imageUploadPolicy";
import { reportRuntimeError } from "./logger";

export { isHeicOrHeifImage } from "./imageUploadPolicy";
export type { ImageUploadFile } from "./imageUploadPolicy";

export type NormalizedImageUploadFile<TFile extends ImageUploadFile> = {
  cleanup: () => Promise<void>;
  convertedFromHeic: boolean;
  file: TFile;
};

const HEIC_FILE_EXTENSION_PATTERN = /\.(?:heic|heif)$/iu;
const IMAGE_NORMALIZATION_TIMEOUT_MS = 30_000;

type ImageManipulatorRenderResult = {
  release: () => void;
  saveAsync: (options: { compress: number; format: string }) => Promise<{ uri: string }>;
};

type ImageManipulatorContext = {
  release: () => void;
  renderAsync: () => Promise<ImageManipulatorRenderResult>;
};

type ImageManipulatorRuntime = {
  ImageManipulator: {
    manipulate: (sourceUri: string) => ImageManipulatorContext;
  };
  SaveFormat: {
    JPEG: string;
  };
};

class ImageManipulatorCapabilityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE);
    this.name = "ImageManipulatorCapabilityError";
    this.code = code;
  }
}

const reportedCapabilityFailures = new Set<string>();

const reportImageManipulatorFailure = (reason: string) => {
  if (reportedCapabilityFailures.has(reason)) return;
  reportedCapabilityFailures.add(reason);
  reportRuntimeError("image-upload-normalization-capability", new Error(reason), {
    capability: "heic_to_jpeg",
    moduleName: IMAGE_MANIPULATOR_NATIVE_MODULE_NAME,
    reason,
  });
};

const loadImageManipulator = async (): Promise<ImageManipulatorRuntime> => {
  // Android production build 80 predates this native module. Probe Expo's native
  // registry before evaluating the package because the package calls
  // requireNativeModule("ExpoImageManipulator") at module scope.
  const resolution = await resolveImageManipulatorRuntime({
    nativeModuleAvailable: requireOptionalNativeModule(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME) != null,
    loadRuntime: async () => await import("expo-image-manipulator") as unknown as ImageManipulatorRuntime,
    validateRuntime: (runtime: unknown) => {
      const candidate = runtime as Partial<ImageManipulatorRuntime> | null;
      return typeof candidate?.ImageManipulator?.manipulate === "function"
        && typeof candidate?.SaveFormat?.JPEG === "string";
    },
  });
  if (!resolution.available) {
    reportImageManipulatorFailure(resolution.reason);
    throw new ImageManipulatorCapabilityError(resolution.reason);
  }
  return resolution.runtime as ImageManipulatorRuntime;
};

const toText = (value: unknown) => String(value ?? "").trim();

const fileNameFromUri = (uri: string) => {
  const withoutQuery = uri.split(/[?#]/u, 1)[0] ?? "";
  return withoutQuery.split("/").pop()?.trim() ?? "";
};

const buildJpegFileName = (file: ImageUploadFile) => {
  const sourceName = toText(file.name) || fileNameFromUri(toText(file.uri));
  const baseName = sourceName
    ? sourceName.replace(HEIC_FILE_EXTENSION_PATTERN, "").replace(/\.[^.]+$/u, "")
    : `photo-${Date.now()}`;
  return `${baseName || `photo-${Date.now()}`}.jpg`;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("image_normalization_timed_out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const readFileSize = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  const size = Number(info && "size" in info ? info.size : 0);
  return Number.isFinite(size) && size > 0 ? size : null;
};

export async function normalizeImageUploadFile<TFile extends ImageUploadFile>(
  file: TFile,
): Promise<NormalizedImageUploadFile<TFile>> {
  if (!isHeicOrHeifImage(file)) {
    return {
      cleanup: async () => undefined,
      convertedFromHeic: false,
      file,
    };
  }

  const sourceUri = toText(file.uri);
  if (!sourceUri) throw new Error("Choose a photo before uploading.");

  let context: ImageManipulatorContext | null = null;
  let renderedImage: ImageManipulatorRenderResult | null = null;

  try {
    const { ImageManipulator, SaveFormat } = await loadImageManipulator();
    context = ImageManipulator.manipulate(sourceUri);
    renderedImage = await withTimeout(context.renderAsync(), IMAGE_NORMALIZATION_TIMEOUT_MS);
    const result = await withTimeout(
      renderedImage.saveAsync({
        compress: 0.92,
        format: SaveFormat.JPEG,
      }),
      IMAGE_NORMALIZATION_TIMEOUT_MS,
    );
    const size = await readFileSize(result.uri);
    let cleaned = false;

    return {
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
      },
      convertedFromHeic: true,
      file: {
        ...file,
        uri: result.uri,
        name: buildJpegFileName(file),
        mimeType: "image/jpeg",
        size,
      },
    };
  } catch (error) {
    if (error instanceof ImageManipulatorCapabilityError) throw error;
    reportImageManipulatorFailure("image_conversion_failed");
    throw new Error("This HEIC or HEIF photo could not be prepared. Choose another photo or try again.");
  } finally {
    renderedImage?.release();
    context?.release();
  }
}
