export type InternalCallMediaDiagnosticPhase = "initial_preferences" | "initial_intent" | "initial_permissions"
  | "initial_projection" | "capture_requested" | "capture_received" | "capture_failed";
export type InternalCallMediaDiagnosticInput = {
  enabled?: boolean;
  requestedCamera?: boolean;
  requestedMic?: boolean;
  wantsCamera?: boolean;
  wantsMic?: boolean;
  canUseCamera?: boolean;
  canUseMic?: boolean;
  backgroundAudioAllowed?: boolean;
  provedCamera?: boolean;
  provedMic?: boolean;
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
