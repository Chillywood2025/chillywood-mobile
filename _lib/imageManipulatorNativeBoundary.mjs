export const IMAGE_MANIPULATOR_NATIVE_MODULE_NAME = "ExpoImageManipulator";
export const IMAGE_MANIPULATOR_UNAVAILABLE_MESSAGE =
  "This app build cannot prepare HEIC or HEIF photos. Choose a JPEG or PNG photo, or update Chi'llywood.";

export async function resolveImageManipulatorRuntime(input) {
  if (input?.nativeModuleAvailable !== true) {
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
