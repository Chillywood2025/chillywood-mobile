import { Platform } from "react-native";
import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";

export const PAID_VIDEO_PROTOCOL = "isolated-paid-video-v1" as const;
export function newPaidVideoRequestId(): string {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const PAID_VIDEO_PROFILE = Object.freeze({ id: "scpv-mp4-h264-aac-v1", maxBytes: 16777216, maxDurationMs: 60000, maxWidth: 1920,
  maxHeight: 1080, maxFramesPerSecond: 60, videoCodec: "h264", pixelFormat: "yuv420p", optionalAudioCodec: "aac", maxAudioChannels: 2, maxAudioSampleRate: 48000 } as const);
export type PaidVideoActor = Readonly<{ userId: string; accountId: string; sessionGeneration: string }>;
export type PaidVideoUpload = Readonly<{ id: string; title: string; resourceId: string; assetId: string; incarnation: string;
  state: "reserved" | "scan_pending" | "clean" | "rejected" | "retired"; expectedSha256: string; expectedByteLength: number;
  bytesClean: boolean; moderation: "unreviewed" | "clear" | "held" | "removed"; profile: "scpv-mp4-h264-aac-v1"; expiresAt: string;
  transferAvailable: false; checkoutAvailable: false }>;
export type PaidVideoAsset = Readonly<{ id: string; incarnation: string; sha256: string; byteLength: number; resourceRevision: number; profile: "scpv-mp4-h264-aac-v1" }>;
export type PaidVideoResource = Readonly<{ id: string; creatorId: string; kind: "paid_content"; revision: number; status: "draft" | "quarantined" | "published" | "retired"; title: string }>;
export type PaidVideoOffer = Readonly<{ id: string; resourceId: string; kind: "paid_content"; revision: number; status: "draft" | "published" | "retired";
  amountMinor: number; currency: string; resourceRevision: number; asset: PaidVideoAsset; checkoutAvailable: false }>;
export type PaidVideoPayloads = {
  "capability.read": Record<string, never>;
  "studio.read": { limit: number; cursor: string | null };
  "upload.reserve": { title: string; expectedSha256: string; expectedByteLength: number };
  "upload.read": { uploadId: string };
  "upload.finalize": { uploadId: string };
  "upload.recover": { originalRequestId: string };
  "resource.read": { resourceId: string };
  "offer.publish": { uploadId: string; expectedRevision: number; amountMinor: number; currency: string };
  "offer.retire": { offerId: string; expectedRevision: number };
  "offer.read": { offerId: string };
};
export type PaidVideoCommand = keyof PaidVideoPayloads;
export type PaidVideoMutation = "upload.reserve" | "upload.finalize" | "offer.publish" | "offer.retire";
export type PaidVideoRecordedRecovery = Readonly<{ state: "recorded"; originalRequestId: string; originalCommand: PaidVideoMutation;
  originalSessionGeneration: string; originalPayload: Record<string, unknown> }>;
export type PaidVideoData = {
  "capability.read": { creatorEligible: boolean; uploadRouteAvailable: boolean; transferAvailable: false; checkoutAvailable: false; profile: typeof PAID_VIDEO_PROFILE };
  "studio.read": { uploads: PaidVideoUpload[]; nextCursor: string | null };
  "upload.reserve": { upload: PaidVideoUpload };
  "upload.read": { upload: PaidVideoUpload };
  "upload.finalize": { upload: PaidVideoUpload };
  "upload.recover": { recovery: PaidVideoRecordedRecovery; upload: PaidVideoUpload; offer?: PaidVideoOffer };
  "resource.read": { resource: PaidVideoResource; upload: PaidVideoUpload };
  "offer.publish": { offer: PaidVideoOffer; upload: PaidVideoUpload };
  "offer.retire": { offer: PaidVideoOffer; upload: PaidVideoUpload };
  "offer.read": { offer: PaidVideoOffer; upload?: PaidVideoUpload };
};
type Envelope<C extends PaidVideoCommand> = Readonly<{ protocol: typeof PAID_VIDEO_PROTOCOL; command: C; requestId: string; actor: PaidVideoActor }>;
export type PaidVideoResponse<C extends PaidVideoCommand = PaidVideoCommand> = Envelope<C> & (
  { status: "ok"; data: PaidVideoData[C] } | { status: "held"; data: { reason: "immutable_upload_route_unavailable" | "protocol3_catalog_unavailable" } }
  | { status: "unknown"; data: { recovery: { state: "unknown"; originalRequestId: string } } });
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: unknown, expected: readonly string[]): value is Row => row(value) && Object.keys(value).sort().join(",") === [...expected].sort().join(",");
export const paidVideoUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export const paidVideoId = (value: unknown, kind: "upload" | "resource" | "asset" | "offer" | "grant"): value is string => typeof value === "string"
  && value.startsWith(kind === "upload" ? "scpv_upload_" : `scv1_${kind}_`) && paidVideoUuid(value.slice((kind === "upload" ? "scpv_upload_" : `scv1_${kind}_`).length));
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const integer = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= max;
const title = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const currency = (v: unknown): v is string => typeof v === "string" && /^[a-z]{3}$/u.test(v);
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d\d-\d\dT/u.test(v) && Number.isFinite(Date.parse(v));
const selected = (v: unknown, values: readonly string[]) => typeof v === "string" && values.includes(v);
const PAYLOAD_KEYS: Record<PaidVideoCommand, readonly string[]> = {
  "capability.read": [], "studio.read": ["limit", "cursor"], "upload.reserve": ["title", "expectedSha256", "expectedByteLength"],
  "upload.read": ["uploadId"], "upload.finalize": ["uploadId"], "upload.recover": ["originalRequestId"], "resource.read": ["resourceId"],
  "offer.publish": ["uploadId", "expectedRevision", "amountMinor", "currency"], "offer.retire": ["offerId", "expectedRevision"], "offer.read": ["offerId"],
};
export const isPaidVideoMutation = (command: unknown): command is PaidVideoMutation => selected(command, ["upload.reserve", "upload.finalize", "offer.publish", "offer.retire"]);
export function validPaidVideoPayload(command: unknown, value: unknown): boolean {
  if (typeof command !== "string" || !Object.hasOwn(PAYLOAD_KEYS, command) || !keys(value, PAYLOAD_KEYS[command as PaidVideoCommand])) return false;
  switch (command) {
    case "capability.read": return true;
    case "studio.read": return integer(value.limit, 50) && (value.cursor === null || paidVideoId(value.cursor, "upload"));
    case "upload.reserve": return title(value.title) && hash(value.expectedSha256) && integer(value.expectedByteLength, PAID_VIDEO_PROFILE.maxBytes);
    case "upload.read": case "upload.finalize": return paidVideoId(value.uploadId, "upload");
    case "upload.recover": return paidVideoUuid(value.originalRequestId);
    case "resource.read": return paidVideoId(value.resourceId, "resource");
    case "offer.publish": return paidVideoId(value.uploadId, "upload") && integer(value.expectedRevision, 999999999999999) && integer(value.amountMinor, 999999999) && currency(value.currency);
    case "offer.retire": return paidVideoId(value.offerId, "offer") && integer(value.expectedRevision, 999999999999999);
    case "offer.read": return paidVideoId(value.offerId, "offer");
    default: return false;
  }
}
export class IsolatedPaidVideoError extends Error {
  constructor(readonly code: "invalid_request" | "authority_retired" | "outcome_unknown" | "invalid_response", readonly requestId: string | null,
    readonly outcome: "not_sent" | "unknown") { super(`Isolated Paid Video: ${code}.`); }
}
function expect(condition: unknown): asserts condition { if (!condition) throw new IsolatedPaidVideoError("invalid_response", null, "unknown"); }
export function parsePaidVideoUpload(value: unknown): PaidVideoUpload {
  expect(keys(value, ["id", "title", "resourceId", "assetId", "incarnation", "state", "expectedSha256", "expectedByteLength", "bytesClean", "moderation", "profile", "expiresAt", "transferAvailable", "checkoutAvailable"])
    && paidVideoId(value.id, "upload") && title(value.title) && paidVideoId(value.resourceId, "resource") && paidVideoId(value.assetId, "asset") && paidVideoUuid(value.incarnation)
    && selected(value.state, ["reserved", "scan_pending", "clean", "rejected", "retired"]) && hash(value.expectedSha256) && integer(value.expectedByteLength, PAID_VIDEO_PROFILE.maxBytes)
    && typeof value.bytesClean === "boolean" && selected(value.moderation, ["unreviewed", "clear", "held", "removed"]) && value.profile === PAID_VIDEO_PROFILE.id
    && date(value.expiresAt) && value.transferAvailable === false && value.checkoutAvailable === false);
  // bytesClean is historical scan evidence. It does not override current
  // moderation, publication state, grants or provider/delivery holds.
  return value as unknown as PaidVideoUpload;
}
export function parsePaidVideoOffer(value: unknown, upload?: PaidVideoUpload): PaidVideoOffer {
  expect(keys(value, ["id", "resourceId", "kind", "revision", "status", "amountMinor", "currency", "resourceRevision", "asset", "checkoutAvailable"])
    && paidVideoId(value.id, "offer") && paidVideoId(value.resourceId, "resource") && value.kind === "paid_content" && integer(value.revision)
    && selected(value.status, ["draft", "published", "retired"]) && integer(value.amountMinor) && currency(value.currency) && integer(value.resourceRevision) && value.checkoutAvailable === false);
  const asset = value.asset;
  expect(keys(asset, ["id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"]) && paidVideoId(asset.id, "asset") && paidVideoUuid(asset.incarnation)
    && hash(asset.sha256) && integer(asset.byteLength, PAID_VIDEO_PROFILE.maxBytes) && asset.resourceRevision === value.resourceRevision && asset.profile === PAID_VIDEO_PROFILE.id);
  if (upload) expect(value.resourceId === upload.resourceId && asset.id === upload.assetId && asset.incarnation === upload.incarnation
    && asset.sha256 === upload.expectedSha256 && asset.byteLength === upload.expectedByteLength);
  return value as unknown as PaidVideoOffer;
}
function parseResource(value: unknown, upload: PaidVideoUpload, actor: PaidVideoActor): PaidVideoResource {
  expect(keys(value, ["id", "creatorId", "kind", "revision", "status", "title"]) && value.id === upload.resourceId && value.creatorId === actor.userId
    && value.kind === "paid_content" && integer(value.revision) && selected(value.status, ["draft", "quarantined", "published", "retired"]) && value.title === upload.title);
  return value as unknown as PaidVideoResource;
}
export function parsePaidVideoResponse<C extends PaidVideoCommand>(value: unknown, context: { command: C; requestId: string; actor: PaidVideoActor; payload: PaidVideoPayloads[C] }): PaidVideoResponse<C> {
  const { command, requestId, actor, payload } = context;
  expect(paidVideoUuid(requestId) && validPaidVideoPayload(command, payload));
  expect(keys(value, ["protocol", "command", "requestId", "status", "actor", "data"]) && value.protocol === PAID_VIDEO_PROTOCOL && value.command === command && value.requestId === requestId);
  expect(keys(value.actor, ["userId", "accountId", "sessionGeneration"]) && paidVideoUuid(actor.userId) && actor.userId === actor.accountId && paidVideoUuid(actor.sessionGeneration)
    && value.actor.userId === actor.userId && value.actor.accountId === actor.accountId && value.actor.sessionGeneration === actor.sessionGeneration);
  const d = value.data, p = payload as Row;
  if (value.status === "held") {
    expect(keys(d, ["reason"]) && ((command === "upload.reserve" && d.reason === "immutable_upload_route_unavailable") || (command === "offer.publish" && d.reason === "protocol3_catalog_unavailable")));
  } else if (value.status === "unknown") {
    expect(command === "upload.recover" && keys(d, ["recovery"]) && keys(d.recovery, ["state", "originalRequestId"])
      && d.recovery.state === "unknown" && d.recovery.originalRequestId === p.originalRequestId);
  } else {
    expect(value.status === "ok" && row(d));
    if (command === "capability.read") {
      expect(keys(d, ["creatorEligible", "uploadRouteAvailable", "transferAvailable", "checkoutAvailable", "profile"]) && typeof d.creatorEligible === "boolean" && typeof d.uploadRouteAvailable === "boolean"
        && d.transferAvailable === false && d.checkoutAvailable === false && keys(d.profile, Object.keys(PAID_VIDEO_PROFILE)));
      for (const [key, expected] of Object.entries(PAID_VIDEO_PROFILE)) expect(d.profile[key] === expected);
    } else if (command === "studio.read") {
      expect(keys(d, ["uploads", "nextCursor"]) && Array.isArray(d.uploads) && d.uploads.length <= (p.limit as number));
      const uploads = d.uploads.map(parsePaidVideoUpload); expect(new Set(uploads.map(u => u.id)).size === uploads.length);
      expect(d.nextCursor === null || (uploads.length === p.limit && d.nextCursor === uploads.at(-1)?.id && d.nextCursor !== p.cursor));
    } else if (command === "upload.recover") {
      expect(keys(d, ["recovery", "upload", ...(Object.hasOwn(d, "offer") ? ["offer"] : [])]));
      const r = d.recovery; expect(keys(r, ["state", "originalRequestId", "originalCommand", "originalSessionGeneration", "originalPayload"])
        && r.state === "recorded" && r.originalRequestId === p.originalRequestId && isPaidVideoMutation(r.originalCommand) && paidVideoUuid(r.originalSessionGeneration) && row(r.originalPayload));
      const recorded = r.originalPayload;
      expect(keys(recorded, ["protocol", "requestId", ...PAYLOAD_KEYS[r.originalCommand]]) && recorded.protocol === PAID_VIDEO_PROTOCOL && recorded.requestId === r.originalRequestId);
      const fields = Object.fromEntries(PAYLOAD_KEYS[r.originalCommand].map(k => [k, recorded[k]])); expect(validPaidVideoPayload(r.originalCommand, fields));
      const upload = parsePaidVideoUpload(d.upload);
      if (r.originalCommand === "upload.reserve") expect(upload.expectedSha256 === fields.expectedSha256 && upload.expectedByteLength === fields.expectedByteLength && upload.title === (fields.title as string).trim());
      if (r.originalCommand === "upload.finalize" || r.originalCommand === "offer.publish") expect(upload.id === fields.uploadId);
      expect(Object.hasOwn(d, "offer") === (r.originalCommand === "offer.publish" || r.originalCommand === "offer.retire"));
      if (d.offer) { const offer = parsePaidVideoOffer(d.offer, upload); if (r.originalCommand === "offer.retire") expect(offer.id === fields.offerId); }
    } else if (command === "offer.read") {
      expect(keys(d, ["offer", ...(Object.hasOwn(d, "upload") ? ["upload"] : [])]));
      const upload = d.upload === undefined ? undefined : parsePaidVideoUpload(d.upload); expect(parsePaidVideoOffer(d.offer, upload).id === p.offerId);
    } else {
      const extra = command === "resource.read" ? ["resource"] : command.startsWith("offer.") ? ["offer"] : [];
      expect(keys(d, ["upload", ...extra])); const upload = parsePaidVideoUpload(d.upload);
      if (["upload.read", "upload.finalize", "offer.publish"].includes(command)) expect(upload.id === p.uploadId);
      if (command === "upload.reserve") expect(upload.title === (p.title as string).trim() && upload.expectedSha256 === p.expectedSha256 && upload.expectedByteLength === p.expectedByteLength);
      if (command === "resource.read") expect(parseResource(d.resource, upload, actor).id === p.resourceId);
      if (command === "offer.publish") { const offer = parsePaidVideoOffer(d.offer, upload); expect(offer.amountMinor === p.amountMinor && offer.currency === p.currency && offer.resourceRevision === p.expectedRevision); }
      if (command === "offer.retire") expect(parsePaidVideoOffer(d.offer, upload).id === p.offerId);
    }
  }
  return value as unknown as PaidVideoResponse<C>;
}

/** Immutable account/session capture. Auth gaps permanently retire this client;
 * only a new current capture can read retained server history. Mutations are
 * one-use in this runtime and must also be durably journaled by their caller. */
export async function captureIsolatedPaidVideoClient(authority: AccountSessionAuthorityBinding) {
  if (!authority || authority.restoreOnly || authority.userId !== authority.accountId || !paidVideoUuid(authority.userId) || !paidVideoUuid(authority.sessionGeneration)
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedPaidVideoError("authority_retired", null, "not_sent");
  const expected = Object.freeze({ ...authority }); let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority(current => { if (!sameAccountSessionAuthority(expected, current)) retired = true; });
  const assertCurrent = (requestId: string | null = null, sent = false) => {
    if (retired || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) throw new IsolatedPaidVideoError("authority_retired", requestId, sent ? "unknown" : "not_sent");
  };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try { captured = await captureAccountBoundSupabaseMutationSubject(expected.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(expected, captured.authority)) retired = true; assertCurrent();
  } catch { unsubscribe(); throw new IsolatedPaidVideoError("authority_retired", null, "not_sent"); }
  const actor: PaidVideoActor = Object.freeze({ userId: expected.userId, accountId: expected.accountId, sessionGeneration: expected.sessionGeneration });
  const used = new Set<string>();
  return Object.freeze({ actor, assertCurrent, dispose() { retired = true; unsubscribe(); },
    async request<C extends PaidVideoCommand>(command: C, requestId: string, payload: PaidVideoPayloads[C]): Promise<PaidVideoResponse<C>> {
      if (!paidVideoUuid(requestId) || !validPaidVideoPayload(command, payload) || (isPaidVideoMutation(command) && used.has(requestId)))
        throw new IsolatedPaidVideoError("invalid_request", paidVideoUuid(requestId) ? requestId : null, "not_sent");
      assertCurrent(requestId);
      const fields = Object.fromEntries(PAYLOAD_KEYS[command].map(key => [key, (payload as Row)[key]])) as PaidVideoPayloads[C];
      const body = JSON.stringify({ protocol: PAID_VIDEO_PROTOCOL, command, requestId, expectedSessionId: actor.sessionGeneration, payload: fields });
      if (isPaidVideoMutation(command)) used.add(requestId);
      try {
        const response = await fetch(`${SUPABASE_URL.replace(/\/+$/u, "")}/functions/v1/isolated-paid-video-authoring-v1`, {
          method: "POST", headers: { Authorization: `Bearer ${captured.accessToken}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-chillywood-platform": Platform.OS }, body,
        });
        assertCurrent(requestId, true); if (!response.ok) throw new IsolatedPaidVideoError("outcome_unknown", requestId, "unknown");
        const value: unknown = await response.json(); assertCurrent(requestId, true);
        return parsePaidVideoResponse(value, { command, requestId, actor, payload: fields });
      } catch { assertCurrent(requestId, true); throw new IsolatedPaidVideoError("outcome_unknown", requestId, "unknown"); }
    },
  });
}
export type IsolatedPaidVideoClient = Awaited<ReturnType<typeof captureIsolatedPaidVideoClient>>;
