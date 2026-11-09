/** Private service orchestration, not an HTTP handler, scheduler or activation.
 * Work IDs and dependencies are supplied by trusted service routing, never an
 * incoming provider/client body. Only original persisted bytes are projected.
 * A native-consumer receipt is NOT acknowledgement of a shared webhook.
 */
import { projectNativeStoreSandboxMoneyV1, projectNativeStoreSandboxRefundV1 } from "./native-store-sandbox-money-v1.ts";
import { replayNativeStoreSandboxReceiptV1, type NativeStoreSandboxReceiptRowV1 } from "./native-store-sandbox-replay-v1.ts";
import type { NativeStoreSandboxConnectionV1 } from "./native-store-sandbox-bridge-v1.ts";
import type { NativeStoreSandboxClaimRowV1 } from "./native-store-sandbox-reconcile-v1.ts";

type Row = Record<string, unknown>;
export type NativeStoreEffectWorkV1 = Readonly<{ rawReceiptId: string; claimId: string | null; protocolId: string; protocolRevision: number }>;
export type NativeStoreEffectDependenciesV1 = {
  readContext(work: NativeStoreEffectWorkV1): Promise<unknown>;
  readOriginalJournal(rawReceiptId: string): Promise<unknown>;
  resolveOriginalConnection(registry: Readonly<Row>): Promise<NativeStoreSandboxConnectionV1>;
  applyEffect(work: NativeStoreEffectWorkV1, projection: Readonly<Row>): Promise<unknown>;
};
const row = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string[]): v is Row => row(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 512 && v === v.trim();
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => row(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const unavailable = () => Error("native_store_effect_unavailable");
function matchesScope(value: unknown, expected: unknown[]): boolean {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length === expected.length
      && parsed.every((item, index) => typeof item === "string" && item === expected[index]);
  } catch { return false; }
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === "object") { for (const child of Object.values(v)) freeze(child); Object.freeze(v); }
  return v;
}
function validResult(v: unknown, work: NativeStoreEffectWorkV1, kind: string): v is Row {
  if (!keys(v, ["protocol", "consumer", "rawReceiptId", "status", "effectKind", "allocationId", "grantId", "durable", "acknowledgementAllowed", "grantsAccess", "financialAuthority", "payable"])
    || v.protocol !== "native-store-effect-result-v1" || v.consumer !== "native-store-sandbox-v1" || v.rawReceiptId !== work.rawReceiptId
    || !["processed", "already_processed", "purchase_tombstoned"].includes(v.status as string)
    || v.durable !== true || v.acknowledgementAllowed !== true || v.grantsAccess !== false || v.financialAuthority !== false || v.payable !== false) return false;
  if (v.effectKind === "positive_applied") return kind === "purchase" && v.status !== "purchase_tombstoned"
    && typeof v.allocationId === "string" && v.allocationId.startsWith("nssv1_allocation_") && uuid(v.allocationId.slice(17))
    && typeof v.grantId === "string" && v.grantId.startsWith("scv1_grant_") && uuid(v.grantId.slice(11));
  if (v.effectKind === "negative_applied") return kind === "refund" && v.status !== "purchase_tombstoned" && v.allocationId === null && v.grantId === null;
  return kind === "purchase" && v.effectKind === "purchase_tombstoned" && v.allocationId === null && v.grantId === null
    && ["purchase_tombstoned", "already_processed"].includes(v.status as string);
}

export async function processNativeStoreEffectV1(input: NativeStoreEffectWorkV1, deps: NativeStoreEffectDependenciesV1,
  options: { deadlineMs?: number } = {}) {
  const work = freeze(structuredClone(input)), duration = options.deadlineMs ?? 15000;
  const io = Object.freeze({ ...deps });
  if (!keys(work, ["rawReceiptId", "claimId", "protocolId", "protocolRevision"]) || !uuid(work.rawReceiptId)
    || !(work.claimId === null || uuid(work.claimId)) || !uuid(work.protocolId) || !positive(work.protocolRevision)
    || !Number.isSafeInteger(duration) || duration < 1 || duration > 15000
    || ![io.readContext, io.readOriginalJournal, io.resolveOriginalConnection, io.applyEffect].every(fn => typeof fn === "function")) throw unavailable();
  const deadline = performance.now() + duration;
  let applyStarted = false;
  const bounded = async <T,>(call: () => Promise<T>): Promise<T> => {
    const remaining = deadline - performance.now(); if (remaining <= 0) throw unavailable();
    let timer: ReturnType<typeof setTimeout>;
    try {
      const value = await Promise.race([call(), new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(unavailable()), remaining); })]);
      // A blocked event loop can deliver a fulfilled dependency before its
      // overdue timer. Late write success must still remain an unknown outcome.
      if (performance.now() >= deadline) throw unavailable();
      return value;
    }
    finally { clearTimeout(timer!); }
  };
  const base = { protocol: "native-store-effect-worker-result-v1" as const, rawReceiptId: work.rawReceiptId,
    acknowledgementAllowed: false as const, grantsAccess: false as const, financialAuthority: false as const, payable: false as const };
  try {
    const context = structuredClone(await bounded(() => io.readContext(work)));
    if (!keys(context, ["protocol", "raw", "claim", "settlementProtocol"]) || context.protocol !== "native-store-effect-context-v1"
      || !row(context.raw) || !row(context.settlementProtocol)) throw unavailable();
    const raw = context.raw, protocol = context.settlementProtocol;
    if (raw.rawReceiptId !== work.rawReceiptId || !digest(raw.rawSha256) || !positive(raw.rawByteLength)
      || typeof raw.conflicted !== "boolean" || typeof raw.intakeEnabled !== "boolean" || typeof raw.originalRevisionRevoked !== "boolean"
      || raw.conflicted || protocol.id !== work.protocolId || protocol.revision !== work.protocolRevision
      || protocol.policy !== "exact_native_usd_consumable_v1" || !text(protocol.productId)
      || !["APP_STORE", "PLAY_STORE"].includes(protocol.store as string)
      || protocol.platform !== (protocol.store === "APP_STORE" ? "ios" : "android")
      || !text(protocol.signedAppVersion) || !text(protocol.nativeBuild) || !text(protocol.nativeVersion) || !text(protocol.sdkVersion)
      || protocol.projectId !== raw.projectId || protocol.appId !== raw.appId || protocol.store !== raw.store
      || protocol.connectionId !== raw.connectionId || protocol.connectionRevision !== raw.connectionRevision || raw.environment !== "SANDBOX"
      || !matchesScope(protocol.scopeKey, ["native-store-sandbox-v1", "revenuecat", raw.projectId, raw.appId, raw.store, "SANDBOX"])) throw unavailable();
    const journal = structuredClone(await bounded(() => io.readOriginalJournal(work.rawReceiptId)));
    if (!keys(journal, ["protocol", "receipt", "registry", "revoked"]) || journal.protocol !== "native-store-sandbox-journal-read-v1"
      || !row(journal.receipt) || !row(journal.registry) || journal.revoked !== raw.originalRevisionRevoked) throw unavailable();
    const receipt = journal.receipt, registry = journal.registry;
    if (receipt.id !== raw.rawReceiptId || receipt.raw_sha256 !== raw.rawSha256 || receipt.raw_byte_length !== raw.rawByteLength
      || receipt.project_id !== raw.projectId || receipt.connection_id !== raw.connectionId || receipt.connection_revision !== raw.connectionRevision
      || registry.id !== raw.connectionId || registry.revision !== raw.connectionRevision || registry.project_id !== raw.projectId
      || registry.app_id !== raw.appId || registry.store !== raw.store || registry.environment !== "SANDBOX") throw unavailable();
    const config = structuredClone(await bounded(() => io.resolveOriginalConnection(freeze(structuredClone(registry)))));
    if (!config || !(config.encryption?.key instanceof Uint8Array) || config.connectionId !== registry.id || config.connectionRevision !== registry.revision
      || config.projectId !== registry.project_id || config.appId !== registry.app_id || config.store !== registry.store || config.environment !== registry.environment
      || config.encryption.keyId !== registry.storage_key_id || config.authentication?.keyVersion !== registry.auth_key_version) throw unavailable();
    config.encryption.key = new Uint8Array(config.encryption.key);
    const original = receipt as NativeStoreSandboxReceiptRowV1;
    const replay = await bounded(() => replayNativeStoreSandboxReceiptV1(original, config, journal.revoked as boolean));
    if (canonical(replay.observation) !== canonical(raw.observation) || replay.observation.productId !== protocol.productId) throw unavailable();
    let projection: Row;
    if (replay.observation.eventType === "NON_RENEWING_PURCHASE") {
      if (!work.claimId || !row(context.claim) || !row(context.claim.claim) || context.claim.claim.id !== `nssv1_claim_${work.claimId}` || !raw.intakeEnabled) throw unavailable();
      const money = await bounded(() => projectNativeStoreSandboxMoneyV1(context.claim as NativeStoreSandboxClaimRowV1, original, config, journal.revoked as boolean));
      if (!money.monetaryCandidate) throw unavailable();
      projection = { protocol: "native-store-authenticated-effect-v1", rawSha256: replay.rawSha256, kind: "purchase",
        amountMinor: money.amountMinor, currency: money.currency, purchasedAt: money.purchasedAt, eventAt: money.eventAt, quantity: 1, cancelReason: null };
    } else {
      if (work.claimId !== null || context.claim !== null) throw unavailable();
      const refund = await bounded(() => projectNativeStoreSandboxRefundV1(original, config, journal.revoked as boolean));
      if (!refund.refundCandidate) throw unavailable();
      projection = { protocol: "native-store-authenticated-effect-v1", rawSha256: replay.rawSha256, kind: "refund",
        amountMinor: null, currency: null, purchasedAt: null, eventAt: refund.eventAt, quantity: null, cancelReason: "CUSTOMER_SUPPORT" };
    }
    // Exactly one call. Timeout, lost response or invalid output stays unknown;
    // no effect retry, replacement purchase, or shared-hook acknowledgement.
    const result = structuredClone(await bounded(() => { applyStarted = true; return io.applyEffect(work, freeze(projection)); }));
    if (!validResult(result, work, projection.kind as string)) throw unavailable();
    return freeze({ ...base, status: "processed" as const, nativeConsumerEffect: result });
  } catch {
    return freeze({ ...base, status: applyStarted ? "unknown" as const : "held" as const, nativeConsumerEffect: null });
  }
}

/** Entry for a trusted persisted-journal notification. It accepts only the raw
 * parent ID: claim and mapping IDs must come from the private database read. */
export async function processPersistedNativeStoreReceiptV1(rawReceiptId: string,
  deps: NativeStoreEffectDependenciesV1 & { readCandidate(rawReceiptId: string): Promise<unknown> },
  options: { deadlineMs?: number } = {}) {
  const duration = options.deadlineMs ?? 15000, io = Object.freeze({ ...deps });
  if (!uuid(rawReceiptId) || !Number.isSafeInteger(duration) || duration < 1 || duration > 15000
    || typeof io.readCandidate !== "function") throw unavailable();
  const deadline = performance.now() + duration;
  let timer: ReturnType<typeof setTimeout>;
  const held = { protocol: "native-store-effect-worker-result-v1" as const, rawReceiptId,
    status: "held" as const, nativeConsumerEffect: null, acknowledgementAllowed: false as const,
    grantsAccess: false as const, financialAuthority: false as const, payable: false as const };
  try {
    const candidate = structuredClone(await Promise.race([io.readCandidate(rawReceiptId),
      new Promise<never>((_r, reject) => { timer = setTimeout(() => reject(unavailable()), duration); })]));
    const remaining = Math.floor(deadline - performance.now());
    if (remaining < 1 || !keys(candidate, ["protocol", "rawReceiptId", "status", "work", "acknowledgementAllowed"])
      || candidate.protocol !== "native-store-effect-candidate-v1" || candidate.rawReceiptId !== rawReceiptId
      || candidate.acknowledgementAllowed !== false || candidate.status !== "candidate"
      || !keys(candidate.work, ["rawReceiptId", "claimId", "protocolId", "protocolRevision"])
      || candidate.work.rawReceiptId !== rawReceiptId || !(candidate.work.claimId === null || uuid(candidate.work.claimId))
      || !uuid(candidate.work.protocolId) || !positive(candidate.work.protocolRevision)) return held;
    clearTimeout(timer!);
    return await processNativeStoreEffectV1(candidate.work as NativeStoreEffectWorkV1, io, { deadlineMs: remaining });
  } catch { return held; }
  finally { clearTimeout(timer!); }
}
