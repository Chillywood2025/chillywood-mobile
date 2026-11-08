import {
  captureAccountBoundSupabaseMutationSubject,
} from "./accountBoundSupabaseMutation";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "./accountBoundSupabaseRpc.mjs";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { Platform } from "react-native";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  subscribeToAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";

// This module is deliberately not routed from existing commerce screens. It
// cannot dispatch providers, sign media, join rooms, or mutate legacy grants.
export const ISOLATED_SANDBOX_COMMERCE_PROTOCOL = "sandbox-commerce-v1" as const;
export const ISOLATED_SANDBOX_COMMERCE_RPC = "isolated_sandbox_commerce_v1" as const;
export const ISOLATED_SANDBOX_PRODUCT_KINDS = [
  "creator_tip", "paid_content", "watch_party_live", "live_watch_party_access",
  "live_watch_party_seat", "event", "channel_subscription", "vip_pass",
  "physical_merch", "event_auction", "room_seat_auction:party_admission", "room_seat_auction:stage_reserved_seat",
] as const;
export type IsolatedSandboxProductKind = typeof ISOLATED_SANDBOX_PRODUCT_KINDS[number];
export type IsolatedSandboxRoomAuctionKind = "party_admission" | "stage_reserved_seat";
export type IsolatedSandboxResourceId = `scv1_resource_${string}`;
export type IsolatedSandboxOfferId = `scv1_offer_${string}`;
export type IsolatedSandboxIntentId = `scv1_intent_${string}`;
export type IsolatedSandboxReceiptId = `scv1_receipt_${string}`;
export type IsolatedSandboxGrantId = `scv1_grant_${string}`;
export type IsolatedSandboxActor = Pick<AccountSessionAuthorityBinding, "userId" | "accountId" | "sessionGeneration">;

export type IsolatedSandboxResource = {
  id: IsolatedSandboxResourceId; kind: IsolatedSandboxProductKind; creatorId: string;
  revision: number; status: "draft" | "quarantined" | "published" | "retired";
};
export type IsolatedSandboxOffer = {
  id: IsolatedSandboxOfferId; resourceId: IsolatedSandboxResourceId;
  kind: IsolatedSandboxProductKind; revision: number;
  status: "draft" | "published" | "retired"; amountMinor: number; currency: string;
};
export type IsolatedSandboxIntent = {
  id: IsolatedSandboxIntentId; offerId: IsolatedSandboxOfferId;
  resourceId: IsolatedSandboxResourceId; kind: IsolatedSandboxProductKind;
  status: "prepared" | "provider_pending" | "verified" | "failed" | "expired";
  providerDispatchAllowed: false;
};
export type IsolatedSandboxReceipt = {
  id: IsolatedSandboxReceiptId; intentId: IsolatedSandboxIntentId;
  offerId: IsolatedSandboxOfferId; resourceId: IsolatedSandboxResourceId;
  kind: IsolatedSandboxProductKind; status: "pending" | "verified" | "refunded" | "revoked" | "quarantined";
  receiptType: "provider_verified";
};
// Actual destinations require independent resource-specific authorization.
// There is intentionally no authorized variant until those integrations exist.
export type IsolatedSandboxDelivery = {
  resourceId: IsolatedSandboxResourceId; kind: IsolatedSandboxProductKind;
  decision: "unavailable" | "pending" | "denied";
};
export type IsolatedSandboxPayloads = {
  "creator.declare": {
    declared18Plus: boolean; countryCode: string; regionCode: string | null;
    declarationVersion: "adult-us-creator-v1";
  };
  "resource.create": { kind: IsolatedSandboxProductKind; title: string };
  "resource.read": { resourceId: IsolatedSandboxResourceId };
  "offer.publish": { resourceId: IsolatedSandboxResourceId; amountMinor: number; currency: string; expectedRevision: number };
  "offer.read": { offerId: IsolatedSandboxOfferId };
  "checkout.prepare": { offerId: IsolatedSandboxOfferId; expectedRevision: number };
  "checkout.read": { intentId: IsolatedSandboxIntentId };
  "receipt.read": { receiptId: IsolatedSandboxReceiptId };
  "delivery.resolve": { resourceId: IsolatedSandboxResourceId; expectedRevision: number };
};
export type IsolatedSandboxCommand = keyof IsolatedSandboxPayloads;
export type IsolatedSandboxData = {
  "creator.declare": { eligible: boolean; declarationId?: string };
  "resource.create": { resource: IsolatedSandboxResource };
  "resource.read": { resource: IsolatedSandboxResource };
  "offer.publish": { offer: IsolatedSandboxOffer };
  "offer.read": { offer: IsolatedSandboxOffer };
  "checkout.prepare": { intent: IsolatedSandboxIntent };
  "checkout.read": { intent: IsolatedSandboxIntent };
  "receipt.read": { receipt: IsolatedSandboxReceipt; grantsAccess: false };
  "delivery.resolve": IsolatedSandboxDelivery;
};
type Envelope<C extends IsolatedSandboxCommand> = {
  protocol: typeof ISOLATED_SANDBOX_COMMERCE_PROTOCOL; environment: "sandbox";
  command: C; requestId: string; actor: IsolatedSandboxActor;
};
export type IsolatedSandboxResult<C extends IsolatedSandboxCommand> = Envelope<C> & (
  | { status: "ok"; data: IsolatedSandboxData[C] }
  | { status: "denied" | "held" | "pending"; data: { reason: string } | (C extends "delivery.resolve" ? IsolatedSandboxDelivery & { reason: string } : never) }
);
type ErrorCode = "invalid_request" | "authority_retired" | "request_conflict"
  | "transport_rejected" | "outcome_unknown" | "invalid_response";
export class IsolatedSandboxCommerceError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly requestId: string | null,
    readonly outcome: "not_dispatched" | "unknown" | "rejected",
  ) {
    super(`Isolated sandbox commerce: ${code}.`);
    this.name = "IsolatedSandboxCommerceError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
const hasKeys = (row: Row, required: string[], optional: string[] = []) =>
  required.every((key) => Object.hasOwn(row, key)) && Object.keys(row).every((key) => required.includes(key) || optional.includes(key));
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isId = (value: unknown, type: "resource" | "offer" | "intent" | "receipt" | "grant") =>
  typeof value === "string" && value.startsWith(`scv1_${type}_`) && isUuid(value.slice(`scv1_${type}_`.length));
const isKind = (value: unknown): value is IsolatedSandboxProductKind =>
  typeof value === "string" && (ISOLATED_SANDBOX_PRODUCT_KINDS as readonly string[]).includes(value);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const currency = (value: unknown): value is string => typeof value === "string" && /^[a-z]{3}$/u.test(value);
const oneOf = (value: unknown, choices: readonly string[]) => typeof value === "string" && choices.includes(value);
const activeActor = (value: AccountSessionAuthorityBinding | null): value is AccountSessionAuthorityBinding =>
  !!value && value.state === "ACTIVE" && value.restoreOnly === false && isUuid(value.userId)
  && value.accountId === value.userId && isUuid(value.sessionGeneration);
const validTitle = (value: unknown) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 160;
const COMMAND_KEYS: Record<IsolatedSandboxCommand, string[]> = {
  "creator.declare": ["declared18Plus", "countryCode", "regionCode", "declarationVersion"],
  "resource.create": ["kind", "title"], "resource.read": ["resourceId"],
  "offer.publish": ["resourceId", "amountMinor", "currency", "expectedRevision"], "offer.read": ["offerId"],
  "checkout.prepare": ["offerId", "expectedRevision"], "checkout.read": ["intentId"],
  "receipt.read": ["receiptId"], "delivery.resolve": ["resourceId", "expectedRevision"],
};
function validPayload(command: IsolatedSandboxCommand, value: unknown): value is Row {
  if (!isRow(value) || !Object.hasOwn(COMMAND_KEYS, command) || !hasKeys(value, COMMAND_KEYS[command])) return false;
  if ("resourceId" in value && !isId(value.resourceId, "resource")) return false;
  if ("offerId" in value && !isId(value.offerId, "offer")) return false;
  if ("intentId" in value && !isId(value.intentId, "intent")) return false;
  if ("receiptId" in value && !isId(value.receiptId, "receipt")) return false;
  if ("expectedRevision" in value && !positiveInteger(value.expectedRevision)) return false;
  if (command === "resource.create") return isKind(value.kind) && validTitle(value.title);
  if (command === "offer.publish") return positiveInteger(value.amountMinor) && currency(value.currency);
  if (command === "creator.declare") return typeof value.declared18Plus === "boolean"
    && typeof value.countryCode === "string" && /^[A-Z]{2}$/u.test(value.countryCode)
    && (value.regionCode === null || (typeof value.regionCode === "string" && /^[A-Z0-9-]{1,12}$/u.test(value.regionCode)))
    && value.declarationVersion === "adult-us-creator-v1";
  return true;
}
function validResource(value: unknown): value is IsolatedSandboxResource {
  return isRow(value) && hasKeys(value, ["id", "kind", "creatorId", "revision", "status"])
    && isId(value.id, "resource") && isKind(value.kind) && isUuid(value.creatorId) && positiveInteger(value.revision)
    && oneOf(value.status, ["draft", "quarantined", "published", "retired"]);
}
function validOffer(value: unknown): value is IsolatedSandboxOffer {
  return isRow(value) && hasKeys(value, ["id", "resourceId", "kind", "revision", "status", "amountMinor", "currency"])
    && isId(value.id, "offer") && isId(value.resourceId, "resource") && isKind(value.kind) && positiveInteger(value.revision)
    && oneOf(value.status, ["draft", "published", "retired"]) && positiveInteger(value.amountMinor) && currency(value.currency);
}
function validIntent(value: unknown): value is IsolatedSandboxIntent {
  return isRow(value) && hasKeys(value, ["id", "offerId", "resourceId", "kind", "status", "providerDispatchAllowed"])
    && isId(value.id, "intent") && isId(value.offerId, "offer") && isId(value.resourceId, "resource") && isKind(value.kind)
    && oneOf(value.status, ["prepared", "provider_pending", "verified", "failed", "expired"])
    && value.providerDispatchAllowed === false;
}
function validReceipt(value: unknown): value is IsolatedSandboxReceipt {
  return isRow(value) && hasKeys(value, ["id", "intentId", "offerId", "resourceId", "kind", "status", "receiptType"])
    && isId(value.id, "receipt") && isId(value.intentId, "intent") && isId(value.offerId, "offer")
    && isId(value.resourceId, "resource") && isKind(value.kind)
    && oneOf(value.status, ["pending", "verified", "refunded", "revoked", "quarantined"]) && value.receiptType === "provider_verified";
}
function validData(command: IsolatedSandboxCommand, data: unknown, payload: Row, actor: IsolatedSandboxActor): boolean {
  if (!isRow(data)) return false;
  switch (command) {
    case "creator.declare": return hasKeys(data, ["eligible"], ["declarationId"]) && typeof data.eligible === "boolean"
      && (!Object.hasOwn(data, "declarationId") || isUuid(data.declarationId));
    case "resource.create": return hasKeys(data, ["resource"]) && validResource(data.resource)
      && data.resource.kind === payload.kind && data.resource.creatorId === actor.userId;
    case "resource.read": return hasKeys(data, ["resource"]) && validResource(data.resource) && data.resource.id === payload.resourceId;
    case "offer.publish": return hasKeys(data, ["offer"]) && validOffer(data.offer)
      && data.offer.resourceId === payload.resourceId && data.offer.amountMinor === payload.amountMinor && data.offer.currency === payload.currency;
    case "offer.read": return hasKeys(data, ["offer"]) && validOffer(data.offer) && data.offer.id === payload.offerId;
    case "checkout.prepare": return hasKeys(data, ["intent"]) && validIntent(data.intent) && data.intent.offerId === payload.offerId;
    case "checkout.read": return hasKeys(data, ["intent"]) && validIntent(data.intent) && data.intent.id === payload.intentId;
    case "receipt.read": return hasKeys(data, ["receipt", "grantsAccess"]) && validReceipt(data.receipt)
      && data.receipt.id === payload.receiptId && data.grantsAccess === false;
    case "delivery.resolve": return hasKeys(data, ["resourceId", "kind", "decision"])
      && data.resourceId === payload.resourceId && isKind(data.kind) && oneOf(data.decision, ["unavailable", "pending", "denied"]);
  }
}
function parseResult<C extends IsolatedSandboxCommand>(
  value: unknown, command: C, requestId: string, payload: Row, actor: IsolatedSandboxActor,
): IsolatedSandboxResult<C> {
  const invalid = () => new IsolatedSandboxCommerceError("invalid_response", requestId, "unknown");
  if (!isRow(value) || !hasKeys(value, ["protocol", "environment", "command", "requestId", "actor", "status", "data"])
    || value.protocol !== ISOLATED_SANDBOX_COMMERCE_PROTOCOL || value.environment !== "sandbox"
    || value.command !== command || value.requestId !== requestId || !isRow(value.actor)
    || !hasKeys(value.actor, ["userId", "accountId", "sessionGeneration"])
    || value.actor.userId !== actor.userId || value.actor.accountId !== actor.accountId
    || value.actor.sessionGeneration !== actor.sessionGeneration) throw invalid();
  if (value.status === "ok") {
    if (!validData(command, value.data, payload, actor)) throw invalid();
  } else if (oneOf(value.status, ["denied", "held", "pending"])) {
    if (!isRow(value.data) || typeof value.data.reason !== "string"
      || !/^[a-z][a-z0-9_]{0,95}$/u.test(value.data.reason)) throw invalid();
    if (!hasKeys(value.data, ["reason"])) {
      if (command !== "delivery.resolve" || !hasKeys(value.data, ["resourceId", "kind", "decision", "reason"])) throw invalid();
      const { resourceId, kind, decision } = value.data;
      if (!validData(command, { resourceId, kind, decision }, payload, actor)) throw invalid();
    }
  } else throw invalid();
  // Copy and freeze accepted JSON so callers cannot replace a receipt or actor
  // after validation. Unknown server fields never become client capabilities.
  return freezeJson(JSON.parse(JSON.stringify(value))) as IsolatedSandboxResult<C>;
}
function freezeJson<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}

export type IsolatedSandboxCommerceClient = {
  actor: Readonly<IsolatedSandboxActor>;
  dispose(): void;
  request<C extends IsolatedSandboxCommand>(command: C, requestId: string, payload: IsolatedSandboxPayloads[C]): Promise<IsolatedSandboxResult<C>>;
};

/** Callers must pass the authority captured by their initiating screen. A new
 * sign-in cannot silently rebind an old screen's operation to another account.
 * Dispose on unmount; a published authority gap permanently retires the client.
 */
export async function captureIsolatedSandboxCommerceClient(
  expected: AccountSessionAuthorityBinding,
): Promise<IsolatedSandboxCommerceClient> {
  if (!activeActor(expected) || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) {
    throw new IsolatedSandboxCommerceError("authority_retired", null, "not_dispatched");
  }
  const authority = Object.freeze({ ...expected });
  let retired = false;
  const unsubscribe = subscribeToAccountSessionAuthority((current) => {
    if (!sameAccountSessionAuthority(authority, current)) retired = true;
  });
  const current = () => !retired && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  const assertCurrent = (requestId: string | null, dispatched: boolean) => {
    if (!current()) throw new IsolatedSandboxCommerceError("authority_retired", requestId, dispatched ? "unknown" : "not_dispatched");
  };
  let captured: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>;
  try {
    assertCurrent(null, false);
    captured = await captureAccountBoundSupabaseMutationSubject(authority.userId, { waitForReadSettlement: true });
    if (!sameAccountSessionAuthority(authority, captured.authority)) retired = true;
    assertCurrent(null, false);
  } catch {
    unsubscribe();
    throw new IsolatedSandboxCommerceError("authority_retired", null, "not_dispatched");
  }
  const subject = Object.freeze({ accessToken: captured.accessToken, authority });
  const actor = Object.freeze({ userId: authority.userId, accountId: authority.accountId, sessionGeneration: authority.sessionGeneration });
  // Same-ID retries are explicit and must use exactly the original command and
  // body. Unknown outcomes are never automatically retried with a new intent.
  const requests = new Map<string, string>();
  const pending = new Set<string>();
  const uncertain = new Set<string>();
  return Object.freeze({
    actor,
    dispose() { retired = true; unsubscribe(); },
    async request<C extends IsolatedSandboxCommand>(command: C, requestId: string, payload: IsolatedSandboxPayloads[C]): Promise<IsolatedSandboxResult<C>> {
      if (!isUuid(requestId) || !validPayload(command, payload)) {
        throw new IsolatedSandboxCommerceError("invalid_request", isUuid(requestId) ? requestId : null, "not_dispatched");
      }
      assertCurrent(requestId, false);
      // Construct from the exact allowlist: no caller protocol, actor, URL,
      // legacy identifier, provider SKU or legal acceptance can be injected.
      const body: Row = { protocol: ISOLATED_SANDBOX_COMMERCE_PROTOCOL, requestId };
      for (const key of COMMAND_KEYS[command]) body[key] = (payload as Row)[key];
      const fingerprint = JSON.stringify([command, body]);
      if (pending.has(requestId) || (requests.has(requestId) && requests.get(requestId) !== fingerprint)) {
        throw new IsolatedSandboxCommerceError("request_conflict", requestId, "not_dispatched");
      }
      requests.set(requestId, fingerprint);
      pending.add(requestId);
      try {
        // Retain actual settlement: the general mutation wrapper's display
        // deadline does not retain transport for this new RPC. The existing
        // raw transport uses the exact captured token; this owner fences the
        // actor before and after and never calls a provider or legacy RPC.
        const result = await invokeAccountBoundSupabaseRpc({
          supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, accessToken: subject.accessToken,
          functionName: ISOLATED_SANDBOX_COMMERCE_RPC, clientPlatform: Platform.OS,
          args: {
            p_command: command, p_payload: body,
            p_expected_account_id: actor.accountId, p_expected_session_generation: actor.sessionGeneration,
          },
        });
        assertCurrent(requestId, true);
        if (result.error) {
          if (uncertain.has(requestId) || isAccountBoundSupabaseRpcOutcomeAmbiguous(result.error)) {
            throw new IsolatedSandboxCommerceError("outcome_unknown", requestId, "unknown");
          }
          const definitive = "code" in result.error && typeof result.error.code === "string"
            && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/u.test(result.error.code);
          throw new IsolatedSandboxCommerceError(definitive ? "transport_rejected" : "outcome_unknown", requestId, definitive ? "rejected" : "unknown");
        }
        const parsed = parseResult(result.data, command, requestId, body, actor);
        uncertain.delete(requestId);
        return parsed;
      } catch (error) {
        if (!(error instanceof IsolatedSandboxCommerceError) || error.outcome === "unknown" || !current()) uncertain.add(requestId);
        assertCurrent(requestId, true);
        if (error instanceof IsolatedSandboxCommerceError) throw error;
        throw new IsolatedSandboxCommerceError("outcome_unknown", requestId, "unknown");
      } finally {
        pending.delete(requestId);
      }
    },
  });
}
