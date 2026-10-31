// Provisional Shippo transport. Qualification is independent of credentials.
// Carrier status corroborates a parcel, never its contents or dispute clearance.
export type TrackingJob = { id: string; order_id: string; carrier: string; tracking_number: string;
  provider_account: string; lease: string; registration_state: string };
export type TrackingFacts = { status: string; status_date: string | null; first_event_at: string | null;
  destination_zip: string | null; destination_country: string | null; carrier: string;
  tracking_number: string; test: boolean; payload_hash: string; review_reason: string | null;
  raw_status_date: string | null; carrier_event_id: string | null };
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v)
  ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
export async function readBoundedTrackingBody(body: ReadableStream<Uint8Array> | null) {
  if (!body) return "";
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 256000) { await reader.cancel(); throw new Error("payload_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", {fatal: true}).decode(bytes);
}
export const hashTrackingBody = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(v)))).map(b => b.toString(16).padStart(2, "0")).join("");
// An offset is mandatory; a timezone-less carrier timestamp is not silently UTC.
const instant = (v: unknown) => typeof v === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(v)
  && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export async function normalizeTracking(raw: string): Promise<TrackingFacts> {
  const p = object(JSON.parse(raw)), status = object(p.tracking_status), address = object(p.address_to);
  const history = Array.isArray(p.tracking_history) ? p.tracking_history.map(object) : [];
  const dates = history.map(h => instant(h.status_date));
  const validDates = dates.filter((d): d is string => !!d).sort();
  const supported = new Set(["UNKNOWN", "PRE_TRANSIT", "TRANSIT", "DELIVERED", "RETURNED", "FAILURE"]);
  return { status: supported.has(text(status.status)) ? text(status.status) : "UNKNOWN",
    status_date: instant(status.status_date), first_event_at: validDates[0] ?? null,
    destination_zip: text(address.zip).toUpperCase() || null,
    destination_country: text(address.country).toUpperCase() || null,
    carrier: text(p.carrier).toLowerCase(), tracking_number: text(p.tracking_number).toUpperCase(),
    test: p.test === true, payload_hash: await hashTrackingBody(raw),
    raw_status_date: text(status.status_date).slice(0,64) || null,
    carrier_event_id: text(status.object_id).slice(0,128) || null,
    review_reason: dates.some(d => d === null) || !instant(status.status_date) ? "ambiguous_carrier_timestamp" : null };
}
export async function verifyTrackingSignature(raw: string, header: string, secret: string, now = Date.now()) {
  const m = /^t=(\d{10}),v1=([a-fA-F0-9]{64})$/.exec(header);
  if (!m || !secret || Math.abs(now / 1000 - Number(m[1])) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(m[2].match(/../g)!, n => parseInt(n, 16));
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(`${m[1]}.${raw}`));
}
export function trackingNotification(raw: string) {
  const p = object(JSON.parse(raw)), data = object(p.data);
  if (p.event !== "track_updated" || data.test !== true) throw new Error("unsupported_tracking_notification");
  const carrier = text(data.carrier).toLowerCase(), tracking_number = text(data.tracking_number).toUpperCase();
  if (!/^[a-z_]{2,30}$/.test(carrier) || !/^[A-Z0-9_-]{5,100}$/.test(tracking_number)) throw new Error("invalid_tracking_identity");
  return {carrier, tracking_number};
}
export async function shippoRequest(job: TrackingJob, token: string, register: boolean,
  transport: typeof fetch = fetch): Promise<string> {
  // This source is intentionally sandbox-only. No accidental live key fallback.
  if (!token.startsWith("shippo_test_") || !job.provider_account) throw new Error("tracking_sandbox_credentials_required");
  const base = "https://api.goshippo.com/tracks/";
  const response = await transport(register ? base : `${base}${encodeURIComponent(job.carrier)}/${encodeURIComponent(job.tracking_number)}`,
    { method: register ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `ShippoToken ${token}`, "SHIPPO-ACCOUNT-ID": job.provider_account,
        ...(register ? {"Content-Type": "application/x-www-form-urlencoded"} : {}) },
      ...(register ? {body: new URLSearchParams({carrier: job.carrier, tracking_number: job.tracking_number,
        metadata: job.id}).toString()} : {}) });
  if (!response.ok) throw new Error(response.status === 429 ? "carrier_rate_limited" : "carrier_unavailable");
  return readBoundedTrackingBody(response.body);
}
