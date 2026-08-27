const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeUuid = (value: unknown) => {
  const text = toText(value).toLowerCase();
  return UUID_PATTERN.test(text) ? text : null;
};

const decodeBase64UrlJson = (value: string): Record<string, unknown> | null => {
  const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
  if (!normalized || /[^A-Za-z0-9+/=]/u.test(normalized)) return null;
  try {
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = JSON.parse(new TextDecoder().decode(bytes));
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

/**
 * Extracts the Supabase session id from a bearer token. Callers must only use
 * this after Supabase Auth has successfully verified the same bearer token.
 */
export const readVerifiedSupabaseSessionGeneration = (
  authorization: unknown,
): string | null => {
  const match = /^Bearer[ \t]+([^ \t]+)$/iu.exec(toText(authorization));
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  const payload = decodeBase64UrlJson(parts[1]);
  return normalizeUuid(payload?.session_id);
};

/**
 * LiveKit returns participant metadata that originated in the signed access
 * token. Require every server-bound field to match the room/identity being
 * evaluated before accepting the embedded Supabase session generation.
 */
export const readLiveKitParticipantSessionGeneration = (
  metadata: unknown,
  expected: { participantIdentity: string; roomName: string },
): string | null => {
  const text = toText(metadata);
  if (!text || text.length > 4_096) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const row = parsed as Record<string, unknown>;
    const participantIdentity = normalizeUuid(expected.participantIdentity);
    if (
      row.app !== "chillywood-mobile" ||
      toText(row.roomName) !== expected.roomName ||
      normalizeUuid(row.userId) !== participantIdentity
    ) return null;
    return normalizeUuid(row.sessionGeneration);
  } catch {
    return null;
  }
};
