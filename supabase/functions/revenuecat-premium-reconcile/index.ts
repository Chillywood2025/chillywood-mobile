import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateBearerUser,
  createAdminClient,
  hashText,
  jsonResponse,
  optionsResponse,
  readOptionalEnv,
  sanitizeErrorMessage,
  type SupabaseClientLike,
  toText,
  writeProviderReadinessAudit,
} from "../_shared/provider-readiness.ts";
import {
  revenueCatOriginalCustomerId,
  resolveRevenueCatStoreProductIdentifier,
  revenueCatProductId,
} from "./authority.ts";

const FUNCTION_NAME = "revenuecat-premium-reconcile";
const REVENUECAT_API_BASE = "https://api.revenuecat.com";
const PREMIUM_LOOKUP_KEY = "premium";
const PREMIUM_PRODUCT_IDS = new Set([
  "com.chillywood.premium.monthly",
  "com.chillywood.premium.yearly",
]);
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,512}$/u;

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const listItems = (value: unknown): JsonObject[] => {
  if (!isRecord(value) || value.object !== "list" || !Array.isArray(value.items)) return [];
  return value.items.filter(isRecord);
};

const finiteMillis = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : null;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const safeRevenueCatPath = (path: string, projectId?: string) => {
  const url = new URL(path, REVENUECAT_API_BASE);
  if (url.origin !== REVENUECAT_API_BASE) throw new Error("revenuecat_api_path_invalid");
  if (!url.pathname.startsWith("/v2/")) throw new Error("revenuecat_api_version_invalid");
  if (projectId && !url.pathname.startsWith(`/v2/projects/${encodeURIComponent(projectId)}/`)) {
    throw new Error("revenuecat_project_path_invalid");
  }
  return url;
};

const revenueCatGet = async (apiKey: string, path: string, projectId?: string) => {
  const response = await fetch(safeRevenueCatPath(path, projectId), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    method: "GET",
  });
  if (!response.ok) throw new Error(`revenuecat_read_failed_${response.status}`);
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error("revenuecat_response_invalid");
  return value;
};

const readRevenueCatProjectId = async (apiKey: string) => {
  const configured = toText(readOptionalEnv("REVENUECAT_PROJECT_ID"));
  if (configured) {
    if (!SAFE_ID.test(configured)) throw new Error("revenuecat_project_id_invalid");
    return configured;
  }

  const response = await revenueCatGet(apiKey, "/v2/projects?limit=100");
  const projectIds = listItems(response).map((item) => toText(item.id)).filter((id) => SAFE_ID.test(id));
  if (projectIds.length !== 1 || toText(response.next_page)) {
    throw new Error("revenuecat_project_identity_ambiguous");
  }
  return projectIds[0];
};

const readAllRevenueCatPages = async (
  apiKey: string,
  firstPath: string,
  projectId: string,
) => {
  const items: JsonObject[] = [];
  let nextPath = firstPath;
  for (let page = 0; page < 10; page += 1) {
    const response = await revenueCatGet(apiKey, nextPath, projectId);
    items.push(...listItems(response));
    const next = toText(response.next_page);
    if (!next) return items;
    nextPath = next;
  }
  throw new Error("revenuecat_pagination_limit_exceeded");
};

const entitlementIsPremium = (subscription: JsonObject) => {
  const entitlements = isRecord(subscription.entitlements) ? subscription.entitlements : null;
  return listItems(entitlements).some((entitlement) => (
    toText(entitlement.lookup_key) === PREMIUM_LOOKUP_KEY
    && toText(entitlement.state).toLowerCase() === "active"
  ));
};

const eligibleSubscription = (subscription: JsonObject, userId: string, now: number) => {
  const startsAt = finiteMillis(subscription.current_period_starts_at);
  const expiresAt = finiteMillis(subscription.current_period_ends_at ?? subscription.ends_at);
  const status = toText(subscription.status).toLowerCase();
  return subscription.object === "subscription"
    && toText(subscription.customer_id) === userId
    && !!revenueCatOriginalCustomerId(subscription)
    && toText(subscription.environment).toLowerCase() === "sandbox"
    && toText(subscription.store).toLowerCase() === "app_store"
    && toText(subscription.ownership).toLowerCase() === "purchased"
    && subscription.gives_access === true
    && ["active", "trialing", "in_grace_period"].includes(status)
    && !!startsAt && startsAt <= now + 5 * 60_000
    && !!expiresAt && expiresAt > now && expiresAt > startsAt
    && entitlementIsPremium(subscription);
};

const normalizedEntitlementStatus = (status: unknown) => {
  switch (toText(status).toLowerCase()) {
    case "trialing": return "trialing";
    case "in_grace_period": return "grace_period";
    default: return "active";
  }
};

const readOriginalTransactionId = async (
  apiKey: string,
  projectId: string,
  subscription: JsonObject,
) => {
  const subscriptionId = toText(subscription.id);
  if (!SAFE_ID.test(subscriptionId)) throw new Error("revenuecat_subscription_id_invalid");
  const transactions = await readAllRevenueCatPages(
    apiKey,
    `/v2/projects/${encodeURIComponent(projectId)}/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?limit=100`,
    projectId,
  );
  const valid = transactions.map((transaction) => ({
    id: toText(transaction.id),
    purchasedAt: finiteMillis(transaction.purchased_at),
  })).filter((transaction) => SAFE_ID.test(transaction.id) && transaction.purchasedAt !== null)
    .sort((left, right) => (left.purchasedAt ?? 0) - (right.purchasedAt ?? 0)
      || left.id.localeCompare(right.id));
  if (!valid.length) throw new Error("revenuecat_original_transaction_missing");
  return valid[0].id;
};

const enforceReconciliationRateLimit = async (adminClient: SupabaseClientLike, userId: string) => {
  const { error } = await adminClient.rpc("enforce_revenuecat_premium_reconciliation_rate_limit", {
    p_user_id: userId,
  });
  if (!error) return true;
  if (toText(error.message).toLowerCase().includes("rate_limited")) return false;
  throw new Error("premium_reconciliation_rate_limit_failed");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST to reconcile Premium." });
  }

  const adminConfig = createAdminClient();
  if (!adminConfig.configured) {
    return jsonResponse(503, {
      status: "unavailable",
      entitlementActive: false,
      liveMoneyAction: false,
      message: "Premium verification is temporarily unavailable.",
    });
  }
  const auth = await authenticateBearerUser(adminConfig.client, req.headers.get("authorization"));
  if (auth.response) return auth.response;
  const userId = toText(auth.user?.id);

  try {
    if (!await enforceReconciliationRateLimit(adminConfig.client, userId)) {
      return jsonResponse(429, {
        status: "blocked",
        entitlementActive: false,
        liveMoneyAction: false,
        message: "Please wait a moment before checking Premium again.",
      });
    }
    const apiKey = toText(readOptionalEnv("REVENUECAT_SECRET_API_KEY"));
    if (!apiKey) throw new Error("revenuecat_api_key_missing");
    const projectId = await readRevenueCatProjectId(apiKey);
    const subscriptions = await readAllRevenueCatPages(
      apiKey,
      `/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}/subscriptions?environment=sandbox&limit=100`,
      projectId,
    );
    const now = Date.now();
    const eligible = subscriptions.filter((subscription) => eligibleSubscription(subscription, userId, now));
    if (eligible.length === 0) {
      await writeProviderReadinessAudit(adminConfig.client, {
        actorUserId: userId,
        provider: "revenuecat",
        capability: "premium_entitlement",
        action: "premium_current_customer_reconciliation",
        statusAfter: "blocked",
        reason: "No exact active purchased App Store sandbox Premium subscription was returned for the authenticated RevenueCat customer.",
        proofSource: FUNCTION_NAME,
        metadata: {
          active_subscription_count: 0,
          authority_granted: false,
          provider_payload_stored: false,
          provider_transaction_created: false,
          live_money_action: false,
        },
      });
      return jsonResponse(200, {
        status: "inactive",
        entitlementActive: false,
        liveMoneyAction: false,
      });
    }
    if (eligible.length !== 1) throw new Error("revenuecat_active_subscription_ambiguous");

    const subscription = eligible[0];
    const subscriptionId = toText(subscription.id);
    const originalCustomerId = revenueCatOriginalCustomerId(subscription);
    if (!originalCustomerId) throw new Error("revenuecat_original_customer_id_invalid");
    const productId = revenueCatProductId(subscription);
    if (!SAFE_ID.test(productId)) throw new Error("revenuecat_product_id_invalid");
    const product = await revenueCatGet(
      apiKey,
      `/v2/projects/${encodeURIComponent(projectId)}/products/${encodeURIComponent(productId)}`,
      projectId,
    );
    const providerProductId = resolveRevenueCatStoreProductIdentifier(subscription, product);
    if (!PREMIUM_PRODUCT_IDS.has(providerProductId)) {
      throw new Error("revenuecat_subscription_product_invalid");
    }
    const startsAt = finiteMillis(subscription.current_period_starts_at);
    const expiresAt = finiteMillis(subscription.current_period_ends_at ?? subscription.ends_at);
    if (!startsAt || !expiresAt) throw new Error("revenuecat_subscription_period_invalid");
    const originalTransactionId = await readOriginalTransactionId(apiKey, projectId, subscription);
    const snapshot = {
      customerId: userId,
      environment: "sandbox",
      entitlement: PREMIUM_LOOKUP_KEY,
      expiresAt,
      givesAccess: true,
      originalCustomerId,
      originalTransactionId,
      ownership: "purchased",
      productIdentifier: providerProductId,
      startsAt,
      status: toText(subscription.status).toLowerCase(),
      store: "app_store",
      subscriptionId,
    };
    const payloadHash = await hashText(stableJson(snapshot));
    const snapshotId = `rc-v2:${subscriptionId}:${startsAt}:${expiresAt}`;
    if (!SAFE_ID.test(snapshotId)) throw new Error("revenuecat_snapshot_id_invalid");

    const { data, error } = await adminConfig.client.rpc(
      "reconcile_revenuecat_premium_current_owner_snapshot_atomic",
      {
        p_entitlement_status: normalizedEntitlementStatus(subscription.status),
        p_expires_at: new Date(expiresAt).toISOString(),
        p_observed_at: new Date(now).toISOString(),
        p_original_customer_id: originalCustomerId,
        p_original_transaction_id: originalTransactionId,
        p_provider_product_id: providerProductId,
        p_raw_payload_hash: payloadHash,
        p_revenuecat_subscription_id: subscriptionId,
        p_snapshot_id: snapshotId,
        p_starts_at: new Date(startsAt).toISOString(),
        p_user_id: userId,
      },
    );
    if (error) throw new Error(`premium_reconciliation_projection_failed:${error.message}`);
    const result = isRecord(data) ? data : {};
    const entitlementActive = result.entitlementActive === true;
    if (!entitlementActive) throw new Error("premium_reconciliation_postcondition_failed");

    await writeProviderReadinessAudit(adminConfig.client, {
      actorUserId: userId,
      provider: "revenuecat",
      capability: "premium_entitlement",
      action: "premium_current_customer_reconciliation",
      statusAfter: "sandbox_ready",
      reason: "Exact active RevenueCat App Store sandbox current-customer authority was projected for the authenticated account.",
      proofSource: FUNCTION_NAME,
      metadata: {
        authority_granted: true,
        duplicate_event: result.duplicateEvent === true,
        provider_payload_stored: false,
        provider_transaction_created: false,
        live_money_action: false,
      },
    });
    return jsonResponse(200, {
      status: result.duplicateEvent === true ? "already_reconciled" : "reconciled",
      entitlementActive: true,
      liveMoneyAction: false,
    });
  } catch (error) {
    await writeProviderReadinessAudit(adminConfig.client, {
      actorUserId: userId || null,
      provider: "revenuecat",
      capability: "premium_entitlement",
      action: "premium_current_customer_reconciliation",
      statusAfter: "blocked",
      reason: "Premium current-customer reconciliation failed closed.",
      proofSource: FUNCTION_NAME,
      metadata: {
        authority_granted: false,
        provider_payload_stored: false,
        provider_transaction_created: false,
        live_money_action: false,
      },
    }).catch(() => null);
    return jsonResponse(409, {
      status: "blocked",
      entitlementActive: false,
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
    });
  }
});
