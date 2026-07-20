export const IMAGE_MANIPULATOR_NATIVE_MODULE_NAME = "ExpoImageManipulator";
export const IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE =
  "This app build cannot prepare HEIC or HEIF photos. Choose a JPEG or PNG photo, or update Chi'llywood.";

export async function resolveImageManipulatorRuntime(input) {
  const nativeModuleAvailable = typeof input?.isNativeModuleAvailable === "function"
    ? input.isNativeModuleAvailable() === true
    : input?.nativeModuleAvailable === true;
  if (!nativeModuleAvailable) {
    return {
      available: false,
      reason: "native_module_unavailable",
      runtime: null,
    };
  }

  if (typeof input?.loadRuntime !== "function") {
    return {
      available: false,
      reason: "package_loader_unavailable",
      runtime: null,
    };
  }

  try {
    const runtime = await input.loadRuntime();
    if (
      !runtime
      || typeof runtime !== "object"
      || (typeof input.validateRuntime === "function" && input.validateRuntime(runtime) !== true)
    ) {
      return {
        available: false,
        reason: "package_runtime_invalid",
        runtime: null,
      };
    }
    return {
      available: true,
      reason: "available",
      runtime,
    };
  } catch {
    return {
      available: false,
      reason: "package_load_failed",
      runtime: null,
    };
  }
}

export function createImageManipulatorRuntimeLoader(input) {
  let resolutionPromise = null;
  return () => {
    if (!resolutionPromise) resolutionPromise = resolveImageManipulatorRuntime(input);
    return resolutionPromise;
  };
}

export async function runImageManipulatorConversion(input) {
  let context = null;
  let renderedImage = null;
  try {
    context = input.runtime.ImageManipulator.manipulate(input.sourceUri);
    renderedImage = await input.withTimeout(context.renderAsync());
    return await input.withTimeout(renderedImage.saveAsync({
      compress: input.compress,
      format: input.format,
    }));
  } finally {
    renderedImage?.release();
    context?.release();
  }
}

export function createIdempotentCleanup(cleanup) {
  let cleaned = false;
  return async () => {
    if (cleaned) return;
    cleaned = true;
    await cleanup();
  };
}
