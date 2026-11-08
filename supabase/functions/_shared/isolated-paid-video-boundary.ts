export type PaidVideoActor = Readonly<{ userId: string; sessionId: string; expiresAtMs: number }>;
export type PaidVideoSession = Readonly<{ actor: PaidVideoActor; authorization: string }>;
export type PaidVideoRow = Record<string, unknown>;
export const row = (value: unknown): value is PaidVideoRow => value !== null && typeof value === "object" && !Array.isArray(value);
export const exact = (value: unknown, keys: readonly string[]): value is PaidVideoRow => row(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export const versionedId = (value: unknown, prefix: string): value is string => typeof value === "string"
  && value.startsWith(prefix) && uuid(value.slice(prefix.length));
export class PaidVideoBoundaryError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function strictPaidVideoJson(source: string): unknown {
  let offset = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/u.test(source[offset] ?? "")) offset++; };
  const string = (): string => {
    if (source[offset] !== '"') throw Error("invalid_json");
    const start = offset++;
    while (offset < source.length) {
      if (source[offset] === "\\") { offset += 2; continue; }
      if (source[offset++] === '"') return JSON.parse(source.slice(start, offset));
    }
    throw Error("invalid_json");
  };
  const value = (depth: number): void => {
    if (++nodes > 2048 || depth > 16) throw Error("invalid_json"); space();
    if (source[offset] === "{") {
      offset++; space(); const seen = new Set<string>(); if (source[offset] === "}") { offset++; return; }
      for (;;) {
        const key = string(); if (seen.has(key)) throw Error("duplicate_json_key"); seen.add(key); space();
        if (source[offset++] !== ":") throw Error("invalid_json"); value(depth + 1); space();
        const end = source[offset++]; if (end === "}") return; if (end !== ",") throw Error("invalid_json"); space();
      }
    }
    if (source[offset] === "[") {
      offset++; space(); if (source[offset] === "]") { offset++; return; }
      for (;;) { value(depth + 1); space(); const end = source[offset++]; if (end === "]") return; if (end !== ",") throw Error("invalid_json"); }
    }
    if (source[offset] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(source.slice(offset));
    if (!token) throw Error("invalid_json"); offset += token[0].length;
  };
  value(0); space(); if (offset !== source.length) throw Error("invalid_json"); return JSON.parse(source);
}
export async function readPaidVideoJson(req: Request | Response, limit: number, deadline: number, now = Date.now): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > limit)) throw new PaidVideoBoundaryError("paid_video_body_limit", 413);
  if (!req.body) throw new PaidVideoBoundaryError("paid_video_invalid_request", 400);
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let used = 0;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const remaining = deadline - now(); if (remaining <= 0) throw new PaidVideoBoundaryError("paid_video_deadline", 503);
      const item = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new PaidVideoBoundaryError("paid_video_deadline", 503)), remaining);
      })]).finally(() => clearTimeout(timer));
      if (item.done) break; used += item.value.byteLength;
      if (used > limit) throw new PaidVideoBoundaryError("paid_video_body_limit", 413); chunks.push(item.value);
    }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(used); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return strictPaidVideoJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new PaidVideoBoundaryError("paid_video_invalid_request", 400); }
}
export function paidVideoHeaders(methods: string): Headers {
  return new Headers({ "cache-control": "private, no-store, max-age=0", pragma: "no-cache", "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer", "access-control-allow-origin": "*", "access-control-allow-methods": methods + ", OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-chillywood-auth-session, x-chillywood-request-id, x-chillywood-native-configuration, range",
    "access-control-expose-headers": "Content-Range, Content-Length, Accept-Ranges", vary: "Authorization, X-Chillywood-Auth-Session, Range" });
}
export function paidVideoJson(status: number, value: unknown, methods: string): Response {
  const headers = paidVideoHeaders(methods); headers.set("content-type", "application/json");
  return new Response(JSON.stringify(value), { status, headers });
}
export function paidVideoPath(req: Request, endpoint: string, prefixes: readonly string[]): string[] {
  const url = new URL(req.url), suffix = "/" + endpoint;
  if (url.search || url.hash || url.username || url.password || /[%\\]/u.test(url.pathname)) throw new PaidVideoBoundaryError("paid_video_invalid_path", 400);
  const accepted = [suffix, "/functions/v1" + suffix];
  const base = accepted.find(path => url.pathname === path || url.pathname.startsWith(path + "/"));
  if (!base) throw new PaidVideoBoundaryError("paid_video_invalid_path", 404);
  const parts = url.pathname.slice(base.length).split("/").slice(1);
  if (parts.length !== prefixes.length || parts.some((part, index) => !versionedId(part, prefixes[index])))
    throw new PaidVideoBoundaryError("paid_video_invalid_path", 400);
  return parts;
}
export function paidVideoSessionHeader(req: Request): string {
  const value = req.headers.get("x-chillywood-auth-session");
  if (!uuid(value)) throw new PaidVideoBoundaryError("paid_video_session_required", 401); return value;
}
export function requirePaidVideoSession(session: PaidVideoSession | null, expected: string, now = Date.now): PaidVideoSession {
  if (!session || !uuid(session.actor.userId) || !uuid(session.actor.sessionId) || session.actor.sessionId !== expected
    || !Number.isSafeInteger(session.actor.expiresAtMs) || session.actor.expiresAtMs <= now())
    throw new PaidVideoBoundaryError("paid_video_invalid_session", 401);
  return freeze({ actor: { ...session.actor }, authorization: session.authorization });
}
export async function paidVideoWithin<T>(deadline: number, work: () => Promise<T>, now = Date.now): Promise<T> {
  const remaining = deadline - now(); if (!Number.isFinite(remaining) || remaining <= 0) throw new PaidVideoBoundaryError("paid_video_deadline", 503);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work(), new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PaidVideoBoundaryError("paid_video_deadline", 503)), remaining);
  })]); } finally { clearTimeout(timer); }
}
export const checkPaidVideoDeadline = (deadline: number, now = Date.now) => {
  if (!Number.isFinite(deadline) || now() >= deadline) throw new PaidVideoBoundaryError("paid_video_deadline", 503);
};
