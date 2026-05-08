import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  createStripeConnectAccount,
  hasClientProviderAccountId,
  jsonResponse,
  normalizeStripeAccount,
  notConfiguredPayload,
  optionsResponse,
  parseJsonPayload,
  readCreatorPayoutAccount,
  readStripeTestSecret,
  requestedAccountType,
  requestedCreatorUserId,
  safeAccountStatusPayload,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  type AuthenticatedUser,
  type StripeConnectAccountPayload,
  type SupabaseClientLike,
  upsertCreatorPayoutAccountFromStripe,
  upsertEligibilityRecord,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-connect-account";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect account requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<StripeConnectAccountPayload>(req);
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
        message: "Creator payout setup can only be requested for the current authenticated creator.",
      });
    }

    const accountType = requestedAccountType(parsed.value);
    if (accountType && accountType !== "express") {
      return jsonResponse(400, {
        error: "unsupported_account_type",
        message: "Stripe Connect payout setup is test-mode Express only in this pass.",
      });
    }

    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, notConfiguredPayload(adminConfig.reason, adminConfig.message, { creatorUserId: currentUser.id }));
    }
    adminClient = adminConfig.client;

    const existingAccount = await readCreatorPayoutAccount(adminClient, currentUser.id);
    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
          accountCreated: false,
          accountReused: !!existingAccount?.provider_account_id,
          creatorUserId: currentUser.id,
          providerAccountPresent: !!existingAccount?.provider_account_id,
        }),
      );
    }

    const requestedAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_account_create_requested",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      metadata: {
        function_name: FUNCTION_NAME,
        provider_account_present: !!existingAccount?.provider_account_id,
        requested_account_type: accountType ?? "express",
      },
      targetId: existingAccount?.id ?? null,
      targetType: "creator_payout_account",
      targetUserId: currentUser.id,
    });

    if (existingAccount?.provider_account_id) {
      return jsonResponse(200, {
        status: "account_reused",
        provider: "stripe",
        providerKey: "stripe_connect",
        mode: "test",
        liveMoneyAction: false,
        creatorUserId: currentUser.id,
        providerAccountPresent: true,
        providerCall: false,
        providerWrite: false,
        accountCreated: false,
        audit: {
          requested: true,
          requestedAuditLogId: requestedAuditId,
        },
        message: "Existing Stripe Connect test-mode payout account reference was reused. No new provider account was created.",
      });
    }

    const stripeAccount = await createStripeConnectAccount(stripeSecret.secret, currentUser);
    const normalizedAccount = normalizeStripeAccount(stripeAccount);
    const accountRow = await upsertCreatorPayoutAccountFromStripe(
      adminClient,
      currentUser.id,
      normalizedAccount,
      existingAccount,
      requestedAuditId,
      FUNCTION_NAME,
    );

    const createdAuditId = await writeAuditLog(adminClient, {
      action: "stripe_connect_account_created",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      afterState: safeAccountStatusPayload(normalizedAccount),
      metadata: {
        function_name: FUNCTION_NAME,
        provider_account_id: normalizedAccount.id,
      },
      targetId: accountRow.id,
      targetType: "creator_payout_account",
      targetUserId: currentUser.id,
    });

    const finalAccountRow = await upsertCreatorPayoutAccountFromStripe(
      adminClient,
      currentUser.id,
      normalizedAccount,
      accountRow,
      createdAuditId,
      FUNCTION_NAME,
    );
    await upsertEligibilityRecord(adminClient, currentUser.id, finalAccountRow.id, normalizedAccount, createdAuditId);

    return jsonResponse(200, {
      status: "configured",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      creatorUserId: currentUser.id,
      providerAccountPresent: true,
      providerCall: true,
      providerWrite: true,
      accountCreated: true,
      payoutCreated: false,
      transferCreated: false,
      checkoutCreated: false,
      account: safeAccountStatusPayload(normalizedAccount),
      audit: {
        created: true,
        createdAuditLogId: createdAuditId,
        requested: true,
        requestedAuditLogId: requestedAuditId,
      },
      message: "Stripe Connect test-mode account was created. Payout execution remains inactive.",
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
      error: "stripe_connect_account_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
    });
  }
});
