export const COMMUNICATION_ROOM_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{6,64}$/u;

export function normalizeCommunicationRoomIdentifier(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return "";
  return COMMUNICATION_ROOM_IDENTIFIER_PATTERN.test(value) ? value : "";
}
