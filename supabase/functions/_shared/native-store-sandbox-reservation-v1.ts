// Incremental source-only handler; no deployed entrypoint or dispatch authority.
type Actor = { userId: string; accountId: string; sessionGeneration: string };
type Command = { protocol: "native-store-sandbox-reservation-v1"; command: "reserve" | "reserve-recover"; requestId: string; payload: { selectionId: string } };
const row = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Record<string, unknown> => row(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const id = (v: unknown, prefix: string) => typeof v === "string" && v.startsWith(prefix) && uuid(v.slice(prefix.length));
export function createNativeStoreReservationHandlerV1(deps: { authenticate(request: Request): Promise<Actor | null>; execute(actor: Actor, command: Command): Promise<unknown> }) {
 return async (request: Request): Promise<Response> => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
  try {
   const authenticated = await deps.authenticate(request);
   if (!authenticated || !uuid(authenticated.userId) || authenticated.accountId !== authenticated.userId || !uuid(authenticated.sessionGeneration)) return reply(401, { error: "unauthorized" });
   const actor = Object.freeze({ userId: authenticated.userId, accountId: authenticated.accountId, sessionGeneration: authenticated.sessionGeneration });
   const raw = await request.text(); if (raw.length > 4096) return reply(400, { error: "invalid_request" }); const c: unknown = JSON.parse(raw);
   if (!keys(c, ["protocol", "command", "requestId", "payload"]) || c.protocol !== "native-store-sandbox-reservation-v1" || !["reserve", "reserve-recover"].includes(String(c.command))
    || !uuid(c.requestId) || !keys(c.payload, ["selectionId"]) || !id(c.payload.selectionId, "nssv1_selection_")) return reply(400, { error: "invalid_request" });
   const command = Object.freeze({ protocol: c.protocol, command: c.command, requestId: c.requestId, payload: Object.freeze({ selectionId: c.payload.selectionId }) }) as Command;
   const value = await deps.execute(actor, command);
   if (!keys(value, ["protocol", "command", "requestId", "actor", "status", "data", "dispatchAllowed", "providerQualified"])
    || value.protocol !== command.protocol || value.command !== command.command || value.requestId !== command.requestId
    || !keys(value.actor, ["userId", "accountId", "sessionGeneration"]) || value.actor.userId !== actor.userId || value.actor.accountId !== actor.accountId || value.actor.sessionGeneration !== actor.sessionGeneration
    || value.dispatchAllowed !== false || value.providerQualified !== false || !keys(value.data, ["reservation", "reason"])) throw Error("invalid_result");
   const d = value.data, r = d.reservation;
   if (value.status === "unknown") {
    if (command.command !== "reserve-recover" || r !== null || d.reason !== "reservation_unknown") throw Error("invalid_result");
   } else if (value.status !== "ok" || d.reason !== null || !keys(r, ["id", "selectionId", "originalRequestId", "originalSessionGeneration", "createdAt", "quoteDigest", "state", "dispatchAllowed", "providerQualified"])
    || !id(r.id, "nssv1_reservation_") || r.selectionId !== command.payload.selectionId || !uuid(r.originalRequestId) || !uuid(r.originalSessionGeneration)
    || command.command === "reserve" && r.originalRequestId !== command.requestId || typeof r.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT/u.test(r.createdAt) || !Number.isFinite(Date.parse(r.createdAt))
    || typeof r.quoteDigest !== "string" || !/^[a-f0-9]{64}$/u.test(r.quoteDigest) || r.state !== "dispatch_reserved" || r.dispatchAllowed !== false || r.providerQualified !== false) throw Error("invalid_result");
   return reply(200, value);
  } catch { return reply(503, { error: "reservation_unconfirmed" }); }
 };
}
