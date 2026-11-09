/** Provider transport boundary. Local tests authenticate synthetic bytes only.
 * This module neither classifies ownership nor grants/project any authority.
 * Configuration is server-owned; never construct it from a request body.
 */
export const ROUTER_PROTOCOL = "rc-router-ingress-v1" as const;
export const MAX_RECEIPT_BYTES = 256 * 1024;
export type RouterObservation = {
  parseStatus: "valid" | "invalid"; issues: string[];
  eventId: string | null; eventType: string | null; appId: string | null;
  store: string | null; environment: string | null; eventAt: string | null;
  userId: string | null; originalUserId: string | null; aliases: string[];
  productId: string | null; transactionId: string | null; originalTransactionId: string | null;
  transferredFrom: string[]; transferredTo: string[]; conflictingUserIds: string[];
};
export type RouterConnection = {
  connectionId: string; connectionRevision: number; projectId: string;
  authentication: { method: "shared_secret"; keyVersion: string; secret: string };
  encryption: { keyId: string; key: Uint8Array };
};
export type RouterEnvelope = {
  protocol: typeof ROUTER_PROTOCOL; rawSha256: string; rawByteLength: number;
  encryption: { algorithm: "AES-256-GCM"; keyId: string; nonce: string; ciphertext: string };
  authentication: { method: "shared_secret"; keyVersion: string };
  observation: RouterObservation;
};
export class RouterBoundaryError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}
const encoder = new TextEncoder();
const exactText = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512
  && v === v.trim() && !/[\u0000-\u001f\u007f]/u.test(v);
const uuid = (v: unknown): v is string => typeof v === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const bytesHex = (bytes: Uint8Array): string => [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
const hash = async (bytes: Uint8Array) => bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))));
const equalBytes = (a: Uint8Array, b: Uint8Array) => {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
};
const base64 = (bytes: Uint8Array) => btoa(Array.from(bytes, v => String.fromCharCode(v)).join(""));
const unbase64 = (s: string) => {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(s))
    throw new RouterBoundaryError("stored_ciphertext_invalid", 503);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};
// PostgreSQL jsonb normalizes object-key order. Arrays and scalar values remain
// exact; JavaScript insertion order is not part of the observation contract.
const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function checkConnection(c: RouterConnection) {
  if (!c || !uuid(c.connectionId) || !Number.isSafeInteger(c.connectionRevision) || c.connectionRevision < 1
    || !exactText(c.projectId) || !c.authentication || c.authentication.method !== "shared_secret"
    || !exactText(c.authentication.keyVersion) || typeof c.authentication.secret !== "string"
    || c.authentication.secret.length < 32 || c.authentication.secret.length > 4096
    || /[\r\n]/u.test(c.authentication.secret) || !c.encryption || !exactText(c.encryption.keyId)
    || !(c.encryption.key instanceof Uint8Array) || c.encryption.key.length !== 32)
    throw new RouterBoundaryError("router_configuration_unavailable", 503);
}

// Reject duplicate keys before JSON.parse can silently choose the final value.
// Bounds include unknown fields; deeply nested subscriber data cannot exhaust us.
function checkJsonStructure(text: string) {
  let i = 0, nodes = 0;
  const space = () => { while (i < text.length && /[ \n\r\t]/u.test(text[i])) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    throw Error("invalid_json");
  };
  const value = (depth: number): void => {
    if (depth > 24 || ++nodes > 10000) throw Error("json_structure_limit");
    space();
    if (text[i] === '{') {
      i++; space(); const keys = new Set<string>();
      if (text[i] === '}') { i++; return; }
      for (;;) {
        if (text[i] !== '"') throw Error("invalid_json");
        const key = string(); if (keys.has(key)) throw Error("duplicate_json_key"); keys.add(key);
        space(); if (text[i++] !== ':') throw Error("invalid_json"); value(depth + 1); space();
        const end = text[i++]; if (end === '}') return; if (end !== ',') throw Error("invalid_json"); space();
      }
    }
    if (text[i] === '[') {
      i++; space(); if (text[i] === ']') { i++; return; }
      for (;;) { value(depth + 1); space(); const end = text[i++]; if (end === ']') return;
        if (end !== ',') throw Error("invalid_json"); }
    }
    if (text[i] === '"') { string(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/u.exec(text.slice(i));
    if (!token) throw Error("invalid_json"); i += token[0].length;
  };
  value(0); space(); if (i !== text.length) throw Error("invalid_json");
}
export function observeRevenueCatBytes(bytes: Uint8Array): RouterObservation {
  const issues: string[] = [];
  const out: RouterObservation = { parseStatus: "invalid", issues, eventId: null, eventType: null,
    appId: null, store: null, environment: null, eventAt: null, userId: null, originalUserId: null,
    aliases: [], productId: null, transactionId: null, originalTransactionId: null, transferredFrom: [], transferredTo: [], conflictingUserIds: [] };
  let parsed: unknown;
  try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); checkJsonStructure(text); parsed = JSON.parse(text); }
  catch (e) { issues.push(e instanceof Error && ["duplicate_json_key", "json_structure_limit"].includes(e.message) ? e.message : "invalid_json"); return out; }
  if (!object(parsed) || parsed.api_version !== "1.0" || !object(parsed.event)) { issues.push("invalid_event_envelope"); return out; }
  const event = parsed.event;
  const field = (key: string) => {
    if (!(key in event) || event[key] === null) return null;
    if (!exactText(event[key])) { issues.push(`invalid_${key}`); return null; } return event[key] as string;
  };
  const array = (key: string): string[] => {
    if (!(key in event)) return [];
    const v = event[key];
    if (!Array.isArray(v)) { issues.push(`invalid_${key}`); return exactText(v) ? [v] : []; }
    if (v.length > 100 || v.some(x => !exactText(x))) issues.push(`invalid_${key}`);
    // Input JSON is already bounded to 10,000 nodes and 256KiB. Keep every
    // independently valid identity; do not discard A because a sibling is null
    // or silently truncate a malformed long transfer list.
    const retained = v.filter(exactText);
    if (new Set(retained).size !== retained.length) issues.push(`duplicate_${key}`);
    return [...new Set(retained)];
  };
  const id = field("id"), alias = field("event_id");
  if (id && alias && id !== alias) issues.push("conflicting_event_id");
  out.eventId = id && alias && id !== alias ? null : id ?? alias;
  out.eventType = field("type"); out.appId = field("app_id"); out.store = field("store");
  out.environment = field("environment"); out.userId = field("app_user_id"); out.originalUserId = field("original_app_user_id");
  out.productId = field("product_id"); out.transactionId = field("transaction_id"); out.originalTransactionId = field("original_transaction_id");
  out.aliases = array("aliases"); out.transferredFrom = array("transferred_from"); out.transferredTo = array("transferred_to");
  for (const [aliasKey, canonical] of [["transferredFrom", "transferredFrom"], ["transferredTo", "transferredTo"]] as const) {
    if (aliasKey in event) {
      issues.push(`unsupported_${aliasKey}`);
      out[canonical] = [...new Set([...out[canonical], ...array(aliasKey)])];
    }
  }
  // The canonical wire contract is snake_case. Alternate identity aliases are
  // retained as ambiguity evidence, never silently preferred or ignored.
  for (const [snake, camel] of [["app_user_id", "appUserId"], ["original_app_user_id", "originalAppUserId"]]) {
    if (camel in event) {
      issues.push(`unsupported_${camel}`);
      for (const key of [snake, camel]) if (exactText(event[key]) && !out.conflictingUserIds.includes(event[key] as string))
        out.conflictingUserIds.push(event[key] as string);
    }
  }
  for (const key of ["originalTransactionId", "transactionId", "productId", "appId"])
    if (key in event) issues.push(`unsupported_${key}`);
  if (event.event_timestamp_ms !== null && event.event_timestamp_ms !== undefined) {
    if (typeof event.event_timestamp_ms !== "number" || !Number.isSafeInteger(event.event_timestamp_ms) || event.event_timestamp_ms <= 0
      || !Number.isFinite(new Date(event.event_timestamp_ms).getTime())) issues.push("invalid_event_timestamp_ms");
    else out.eventAt = new Date(event.event_timestamp_ms).toISOString();
  }
  if (!out.eventId) issues.push("event_id_missing"); if (!out.eventType) issues.push("event_type_missing");
  out.parseStatus = issues.length ? "invalid" : "valid"; return out;
}

async function readBytes(req: Request): Promise<Uint8Array> {
  if (!req.body) throw new RouterBoundaryError("body_required", 400);
  if (req.headers.has("content-encoding") && req.headers.get("content-encoding") !== "identity")
    throw new RouterBoundaryError("encoded_body_unsupported", 415);
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RECEIPT_BYTES))
    throw new RouterBoundaryError("body_limit", 413);
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouterBoundaryError("body_deadline", 408)), 5000); });
  try {
    for (;;) { const part = await Promise.race([reader.read(), timeout]); if (part.done) break;
      total += part.value.length; if (total > MAX_RECEIPT_BYTES) throw new RouterBoundaryError("body_limit", 413); chunks.push(part.value); }
    if (total === 0) throw new RouterBoundaryError("body_required", 400);
    const raw = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.length; } return raw;
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const aad = (c: RouterConnection, rawSha256: string, rawByteLength: number) => encoder.encode(JSON.stringify([
  ROUTER_PROTOCOL, c.connectionId, c.connectionRevision, c.projectId, rawSha256, rawByteLength,
  c.authentication.method, c.authentication.keyVersion, c.encryption.keyId,
]));
export async function authenticateRevenueCatEnvelope(req: Request, connection: RouterConnection, now = Date.now()): Promise<RouterEnvelope> {
  if (!Number.isSafeInteger(now)) throw new RouterBoundaryError("clock_unavailable", 503);
  const raw = await readAuthenticatedRevenueCatBytes(req, connection);
  const auth = connection.authentication;
  const rawSha256 = await hash(raw), nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", new Uint8Array(connection.encryption.key), "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce,
    additionalData: aad(connection, rawSha256, raw.length) }, key, new Uint8Array(raw)));
  return { protocol: ROUTER_PROTOCOL, rawSha256, rawByteLength: raw.length,
    encryption: { algorithm: "AES-256-GCM", keyId: connection.encryption.keyId, nonce: base64(nonce), ciphertext: base64(ciphertext) },
    authentication: { method: auth.method, keyVersion: auth.keyVersion }, observation: observeRevenueCatBytes(raw) };
}

/** Authenticate and bound the original transport before shared-consumer routing.
 * Bytes are private to the handler; this does not persist or acknowledge them. */
export async function readAuthenticatedRevenueCatBytes(req: Request, connection: RouterConnection): Promise<Uint8Array> {
  checkConnection(connection);
  if (req.method !== "POST") throw new RouterBoundaryError("method_not_allowed", 405);
  const auth = connection.authentication;
  // One exact configured Authorization value; no alternate header/JWT fallback.
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.length > 4096 || !equalBytes(encoder.encode(authorization), encoder.encode(auth.secret)))
    throw new RouterBoundaryError("provider_authentication_failed", 401);
  return await readBytes(req);
}

/** Worker-only replay check. Never expose decrypted bytes in a response/log. */
export async function decryptRouterEnvelope(envelope: RouterEnvelope, connection: RouterConnection): Promise<Uint8Array> {
  checkConnection(connection);
  if (envelope.protocol !== ROUTER_PROTOCOL || envelope.rawByteLength < 1 || envelope.rawByteLength > MAX_RECEIPT_BYTES
    || !/^[a-f0-9]{64}$/u.test(envelope.rawSha256) || envelope.encryption.algorithm !== "AES-256-GCM"
    || envelope.encryption.keyId !== connection.encryption.keyId || envelope.authentication.method !== connection.authentication.method
    || envelope.authentication.keyVersion !== connection.authentication.keyVersion)
    throw new RouterBoundaryError("stored_envelope_mismatch", 503);
  try {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(connection.encryption.key), "AES-GCM", false, ["decrypt"]);
    const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(envelope.encryption.nonce),
      additionalData: aad(connection, envelope.rawSha256, envelope.rawByteLength) }, key, unbase64(envelope.encryption.ciphertext)));
    if (raw.length !== envelope.rawByteLength || await hash(raw) !== envelope.rawSha256
      || canonicalJson(observeRevenueCatBytes(raw)) !== canonicalJson(envelope.observation)) throw Error("mismatch");
    return raw;
  } catch { throw new RouterBoundaryError("stored_envelope_mismatch", 503); }
}
