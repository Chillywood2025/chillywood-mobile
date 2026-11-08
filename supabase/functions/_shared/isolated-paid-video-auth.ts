import { authenticateRequest, createAuthClient } from "./stripe-connect.ts";
import { readVerifiedSupabaseSessionGeneration } from "./livekit-session-generation.ts";
import { freeze, row, strictPaidVideoJson, uuid, type PaidVideoSession } from "./isolated-paid-video-boundary.ts";

// One immutable bearer is verified by Auth and the repository's exact current
// session readback. Token decoding occurs only AFTER that verification succeeds.
export async function authenticatePaidVideoRequest(req: Request): Promise<PaidVideoSession | null> {
  const authorization = req.headers.get("authorization");
  if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization)) return null;
  const frozen = new Request(req.url, { method: req.method, headers: { authorization } });
  const { supabaseUrl, supabaseAnonKey } = createAuthClient();
  const result = await authenticateRequest(frozen, supabaseUrl, supabaseAnonKey);
  if (!("user" in result) || !uuid(result.user.id)) return null;
  const sessionId = readVerifiedSupabaseSessionGeneration(authorization);
  if (!sessionId || sessionId !== result.user.sessionGeneration || !uuid(sessionId)) return null;
  try {
    const encoded = authorization.slice(7).split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), character => character.charCodeAt(0));
    const claims = strictPaidVideoJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!row(claims) || claims.sub !== result.user.id || claims.session_id !== sessionId || claims.role !== "authenticated"
      || typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now()
      || !Number.isSafeInteger(claims.exp * 1000)) return null;
    return freeze({ actor: { userId: result.user.id, sessionId, expiresAtMs: claims.exp * 1000 }, authorization });
  } catch { return null; }
}
