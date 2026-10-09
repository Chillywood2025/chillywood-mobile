const PHASES = new Set([
  "initial_preferences", "initial_intent", "initial_permissions", "initial_projection",
  "capture_requested", "capture_received", "capture_failed",
  "automatic_mic_feedback_reserved", "automatic_mic_feedback_settled", "native_mic_feedback",
  "session_restart_requested", "session_restart_started", "session_admission_result", "session_initialization_failed",
  "room_snapshot_missing", "room_snapshot_ended", "signaling_subscription", "room_terminal_received",
]);
const APP_STATES = new Set(["active", "background", "inactive", "unknown", "extension"]);
const SESSION_ENUMS = {
  channelState: new Set(["idle", "connecting", "live", "reconnecting", "error"]),
  subscriptionStatus: new Set(["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]),
  recoveryTrigger: new Set(["app_foreground", "peer_disconnected", "peer_failed", "realtime_closed", "realtime_error", "realtime_timeout"]),
};
const PERMISSIONS = new Set(["granted", "denied", "restricted", "undetermined"]);
const ERRORS = new Set([
  "Error", "TypeError", "DOMException", "NotAllowedError", "NotFoundError", "NotReadableError",
  "AbortError", "OverconstrainedError", "SecurityError", "InvalidStateError", "NotSupportedError",
  "OperationError", "ConstraintNotSatisfiedError", "PermissionDeniedError", "DevicesNotFoundError", "TrackStartError",
]);
const BOOLEANS = ["enabled", "requestedCamera", "requestedMic", "wantsCamera", "wantsMic",
  "canUseCamera", "canUseMic", "backgroundAudioAllowed", "provedCamera", "provedMic",
  "recoverable", "hasAdmission", "isHost", "admitted"];
const read = (value, key) => {
  try { return value && (typeof value === "object" || typeof value === "function") ? value[key] : undefined; }
  catch { return undefined; }
};

export function isInternalCallMediaDiagnosticsEnabled(context) {
  const platform = read(context, "platform");
  const expectedChannel = platform === "android" ? "android-internal-v2"
    : platform === "ios" ? "ios-internal-v2" : null;
  return !!expectedChannel && read(context, "enabled") === true
    && read(context, "channel") === expectedChannel;
}

// Session-wide sequence, not call attribution. Counts are capped at four;
// timing uses only the monotonic process clock. No caller-supplied text is emitted.
export function createInternalCallMediaDiagnosticReporter({ readContext, emit, now }) {
  let sequence = 0;
  let lastUptime = 0;
  return (phase, input = {}) => {
    try {
      if (!PHASES.has(phase)) return;
      const suppliedContext = readContext();
      const context = {
        enabled: read(suppliedContext, "enabled"), channel: read(suppliedContext, "channel"),
        platform: read(suppliedContext, "platform"),
      };
      if (!isInternalCallMediaDiagnosticsEnabled(context)) return;
      if (sequence >= Number.MAX_SAFE_INTEGER) return;
      const receipt = { version: 1, phase, seq: ++sequence, call_hash: "none", platform: read(context, "platform") };
      const uptime = now();
      if (typeof uptime === "number" && Number.isFinite(uptime) && uptime >= 0 && uptime <= Number.MAX_SAFE_INTEGER) {
        lastUptime = Math.max(lastUptime, Math.floor(uptime));
        receipt.uptime_ms = lastUptime;
      }
      for (const field of BOOLEANS) {
        const value = read(input, field);
        if (typeof value === "boolean") receipt[field] = value;
      }
      const appState = read(input, "appState");
      if (APP_STATES.has(appState)) receipt.appState = appState;
      for (const [field, values] of Object.entries(SESSION_ENUMS)) {
        const value = read(input, field);
        if (values.has(value)) receipt[field] = value;
      }
      // A bounded in-process lifecycle counter, never a durable membership,
      // auth generation, account identifier, wall-clock timestamp or token.
      const generation = read(input, "sessionGeneration");
      if (Number.isSafeInteger(generation) && generation >= 0 && generation <= 1_000_000) {
        receipt.sessionGeneration = generation;
      }
      for (const field of ["cameraPermission", "micPermission"]) {
        const value = read(input, field);
        if (PERMISSIONS.has(value)) receipt[field] = value;
      }
      if (phase === "capture_failed") {
        const name = read(read(input, "error"), "name");
        receipt.errorName = ERRORS.has(name) ? name : "other";
      }
      if (phase === "capture_received") {
        const stream = read(input, "stream");
        receipt.streamPresent = stream != null;
        for (const [method, field] of [["getAudioTracks", "audioTracks"], ["getVideoTracks", "videoTracks"]]) {
          try {
            const accessor = read(stream, method);
            const tracks = stream == null ? [] : typeof accessor === "function" ? accessor.call(stream) : null;
            const count = Array.isArray(tracks) ? read(tracks, "length") : undefined;
            if (Number.isSafeInteger(count) && count >= 0) {
              receipt[field] = Math.min(count, 4);
            }
          } catch { /* Missing observation is not a zero-track receipt. */ }
        }
      }
      emit(`[CH_CALL_MEDIA] ${JSON.stringify(receipt)}`);
    } catch { /* Diagnostics never change admission, capture, errors or cleanup. */ }
  };
}
