export type InternalCallMediaDiagnosticPhase = "initial_preferences" | "initial_intent" | "initial_permissions"
  | "initial_projection" | "capture_requested" | "capture_received" | "capture_failed"
  | "automatic_mic_feedback_reserved" | "automatic_mic_feedback_settled" | "native_mic_feedback"
  | "microphone_operation"
  | "session_restart_requested" | "session_restart_started" | "session_admission_result" | "session_initialization_failed"
  | "room_snapshot_missing" | "room_snapshot_ended" | "signaling_subscription" | "room_terminal_received"
  | "native_audio_activation_received" | "native_audio_deactivation_received" | "native_audio_session_retained" | "native_audio_gate" | "native_audio_recovered";
export type InternalMicrophoneOperation = "enable" | "disable" | "compensate";
export type InternalMicrophoneStage = "authority" | "permission" | "capture" | "topology" | "preparation"
  | "sender" | "negotiation" | "durable" | "broadcast" | "rollback" | "control";
export type InternalMicrophoneOutcome = "succeeded" | "unproved" | "superseded" | "glare_retry" | "glare_exhausted";
export type InternalCallMediaDiagnosticInput = {
  microphoneOperation?: InternalMicrophoneOperation;
  microphoneStage?: InternalMicrophoneStage;
  microphoneOutcome?: InternalMicrophoneOutcome;
  enabled?: boolean;
  nativeOwner?: boolean;
  retainedOwner?: boolean;
  activationObserved?: boolean;
  requestedCamera?: boolean;
  requestedMic?: boolean;
  wantsCamera?: boolean;
  wantsMic?: boolean;
  canUseCamera?: boolean;
  canUseMic?: boolean;
  backgroundAudioAllowed?: boolean;
  provedCamera?: boolean;
  provedMic?: boolean;
  recoverable?: boolean;
  hasAdmission?: boolean;
  isHost?: boolean;
  admitted?: boolean;
  channelState?: string;
  subscriptionStatus?: string;
  recoveryTrigger?: string;
  sessionGeneration?: number;
  appState?: string | null;
  cameraPermission?: string;
  micPermission?: string;
  stream?: unknown;
  error?: unknown;
};
export function isInternalCallMediaDiagnosticsEnabled(context: unknown): boolean;
export function createInternalCallMediaDiagnosticReporter(options: {
  readContext: () => unknown;
  emit: (line: string) => unknown;
  now: () => number;
}): (phase: InternalCallMediaDiagnosticPhase, input?: InternalCallMediaDiagnosticInput) => void;
