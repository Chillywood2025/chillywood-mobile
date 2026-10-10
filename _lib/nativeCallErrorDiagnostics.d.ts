export function reportBoundedNativeCallError(
  reporter: (scope: string, error: unknown, metadata?: Record<string, unknown>) => unknown,
  phase: "capture" | "request_answer" | "complete_answer",
  error: unknown,
  context?: {
    audio?: boolean;
    video?: boolean;
    connected?: boolean;
    facingMode?: "user" | "environment";
    appState?: string | null;
  },
): void;
