import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  hasClientProviderAccountId,
  jsonResponse,
  normalizeStripeAccount,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readCreatorPayoutAccount,
  readStripeTestSecret,
  requestedCreatorUserId,
  retrieveStripeConnectAccount,
  safeAccountStatusPayload,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  type AuthenticatedUser,
  type StripeConnectSyncPayload,
  type SupabaseClientLike,
  upsertCreatorPayoutAccountFromStripe,
  upsertEligibilityRecord,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-connect-account-sync";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect account-sync requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<StripeConnectSyncPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasClientProviderAccountId(parsed.value)) {
      return jsonResponse(400, {
        error: "provider_account_id_not_allowed",
        message: "Provider account ids are backend-owned and are not accepted from the client.",
      });
    }

    const requestedCreatorId = requestedCreatorUserId(parsed.value);
    if (requestedCreatorId && requestedCreatorId !== currentUser.id) {
      return jsonResponse(403, {
        error: "creator_mismatch",
        message: "Creator payout setup can only be synced for the current authenticated creator.",
      });
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, { creatorUserId: currentUser.id }));
    }
    adminClient = adminConfig.client;

    const payoutAccount = await readCreatorPayoutAccount(adminClient, currentUser.id);
    if (!payoutAccount?.provider_account_id) {
      return jsonResponse(200, {
        status: "setup_required",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        creatorUserId: currentUser.id,
        providerAccountPresent: false,
        providerCall: false,
        providerWrite: false,
        accountSynced: false,
        message: "A Stripe Connect test-mode account must be created before provider status can be synced.",
      });
    }

    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
          accountSynced: false,
          creatorUserId: currentUser.id,
          providerAccountPresent: true,
        }),
      );
    }

    const requestedAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_account_sync_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      metadata: {
        function_name: FUNCTION_NAME,
        provider_account_id: payoutAccount.provider_account_id,
      },
      targetId: payoutAccount.id,
      targetType: "creator_payout_account",
      targetUserId: currentUser.id,
    });

    const stripeAccount = await retrieveStripeConnectAccount(stripeSecret.secret, payoutAccount.provider_account_id);
    const normalizedAccount = normalizeStripeAccount(stripeAccount);
    const syncedAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_account_synced",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: safeAccountStatusPayload(normalizedAccount),
      metadata: {
        function_name: FUNCTION_NAME,
        provider_account_id: normalizedAccount.id,
      },
      targetId: payoutAccount.id,
      targetType: "creator_payout_account",
      targetUserId: currentUser.id,
    });

    const updatedAccount = await upsertCreatorPayoutAccountFromStripe(
      adminClient,
      currentUser.id,
      normalizedAccount,
      payoutAccount,
      syncedAuditId,
      FUNCTION_NAME,
    );
    await upsertEligibilityRecord(adminClient, currentUser.id, updatedAccount.id, normalizedAccount, syncedAuditId);

    return jsonResponse(200, {
      status: "synced",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      creatorUserId: currentUser.id,
      providerAccountPresent: true,
      providerCall: true,
      providerWrite: true,
      accountSynced: true,
      payoutCreated: false,
      transferCreated: false,
      checkoutCreated: false,
      account: safeAccountStatusPayload(normalizedAccount),
      audit: {
        requested: true,
        requestedAuditLogId: requestedAuditId,
        synced: true,
        syncedAuditLogId: syncedAuditId,
      },
      message: "Stripe Connect test-mode account status was synced. Payout execution remains inactive.",
    });
  } catch (error) {
    await safeWriteAuditLog(adminClient, {
      action: "stripe_connect_error",
      actorEmail: currentUser?.email ?? null,
      actorUserId: currentUser?.id ?? null,
      metadata: {
        error: sanitizeErrorMessage(error),
        function_name: FUNCTION_NAME,
      },
      severity: "warning",
      targetType: "creator_payout_account",
      targetUserId: currentUser?.id ?? null,
    });

    return jsonResponse(500, {
      error: "stripe_connect_account_sync_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
    });
  }
});
