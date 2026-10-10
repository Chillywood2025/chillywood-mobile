const SCOPES = Object.freeze({
  capture: "communication-native-capture",
  request_answer: "ios-native-answer-request",
  complete_answer: "ios-native-answer-complete",
});
const ERROR_NAMES = new Set([
  "Error", "TypeError", "DOMException", "NotAllowedError", "NotFoundError", "NotReadableError",
  "AbortError", "OverconstrainedError", "SecurityError", "InvalidStateError", "NotSupportedError",
  "OperationError", "ConstraintNotSatisfiedError", "PermissionDeniedError", "DevicesNotFoundError", "TrackStartError",
]);
const ERROR_DOMAINS = new Set([
  "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSOSStatusErrorDomain", "NSURLErrorDomain",
  "AVFoundationErrorDomain", "com.apple.coreaudio.avfaudio",
  "com.apple.CallKit.error.incomingcall", "com.apple.CallKit.error.requesttransaction",
]);
const ERROR_CODES = new Set(["E_PERMISSION_MISSING", "E_UNSPECIFIED", "ERR_UNEXPECTED", "ERR_INVALID_ARGUMENT"]);
const read = (value, key) => {
  try { return value && (typeof value === "object" || typeof value === "function") ? value[key] : undefined; }
  catch { return undefined; }
};

// Diagnostic failure cannot change call behavior. No arbitrary error text,
// stack, payload, identifier, URL, or unknown context key reaches the reporter.
export function reportBoundedNativeCallError(reporter, phase, error, context = {}) {
  if (!Object.hasOwn(SCOPES, phase)) return;
  const name = read(error, "name");
  const domain = read(error, "domain");
  const code = read(error, "code");
  const metadata = {
    phase,
    nativeErrorName: ERROR_NAMES.has(name) ? name : "other",
    nativeErrorDomain: ERROR_DOMAINS.has(domain) ? domain : "other",
  };
  if (Number.isSafeInteger(code) || ERROR_CODES.has(code)) metadata.nativeErrorCode = code;
  for (const key of ["audio", "video", "connected"]) {
    const value = read(context, key);
    if (typeof value === "boolean") metadata[key] = value;
  }
  const facingMode = read(context, "facingMode");
  if (facingMode === "user" || facingMode === "environment") metadata.facingMode = facingMode;
  const appState = read(context, "appState");
  if (["active", "background", "inactive", "unknown", "extension"].includes(appState)) metadata.appState = appState;
  try {
    reporter(SCOPES[phase], {
      name: "NativeCallOperationError",
      message: `native_call_${phase}_failed`,
    }, metadata);
  } catch { /* Reporting is non-authoritative and must preserve the original result. */ }
}
