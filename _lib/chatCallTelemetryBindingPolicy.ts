export type ChatCallTelemetryBindingKind = "room_code" | "uuid";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const COMMUNICATION_ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/u;

export const sanitizeChatCallTelemetryBinding = (
  value: unknown,
  kind: ChatCallTelemetryBindingKind,
) => {
  const normalized = String(value ?? "").trim();
  if (kind === "uuid") {
    return UUID_PATTERN.test(normalized) ? normalized.toLowerCase() : "";
  }
  const roomCode = normalized.toUpperCase();
  return COMMUNICATION_ROOM_CODE_PATTERN.test(roomCode) ? roomCode : "";
};
