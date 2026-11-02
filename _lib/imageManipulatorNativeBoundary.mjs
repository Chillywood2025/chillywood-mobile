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
  return new Promise((resolve, reject) => {
    // The caller still receives each stage's timeout promptly. The raw worker
    // retains the source/context until native actually settles, and does not
    // start the next stage after a timed-out render.
    const convert = async () => {
      let context = null;
      let renderedImage = null;
      try {
        context = input.runtime.ImageManipulator.manipulate(input.sourceUri);
        const render = context.renderAsync();
        try {
          renderedImage = await input.withTimeout(render);
        } catch (error) {
          reject(error);
          renderedImage = await Promise.resolve(render).catch(() => null);
          return;
        }
        const save = renderedImage.saveAsync({ compress: input.compress, format: input.format });
        try {
          resolve(await input.withTimeout(save));
        } catch (error) {
          reject(error);
          const abandonedOutput = await Promise.resolve(save).catch(() => null);
          if (abandonedOutput) await input.discardOutput?.(abandonedOutput);
        }
      } catch (error) {
        reject(error);
      } finally {
        // Cleanup failures must not hide a native/timeout error or prevent the
        // other handle from releasing. Both handles remain live during raw IO.
        try { renderedImage?.release(); } catch { /* Best-effort native cleanup. */ }
        try { context?.release(); } catch { /* Best-effort native cleanup. */ }
      }
    };
    try {
      const work = input.withRead ? input.withRead(convert) : convert();
      // Observe late failures without creating an unhandled rejecting finally.
      void Promise.resolve(work).catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

export function createIdempotentCleanup(cleanup) {
  let cleaned = false;
  return async () => {
    if (cleaned) return;
    cleaned = true;
    await cleanup();
  };
}
