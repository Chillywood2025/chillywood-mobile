import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateRequest,
  createAdminClient,
  createAuthClient,
  createStripeConnectOnboardingLink,
  hasClientProviderAccountId,
  insertOnboardingSession,
  jsonResponse,
  markOnboardingStarted,
  notConfiguredPayload,
  onboardingLinkExpiresAt,
  optionsResponse,
  parseJsonPayload,
  readCreatorPayoutAccount,
  readStripeTestSecret,
  resolveRedirectUrls,
  safeUrlOrigin,
  safeWriteAuditLog,
  sanitizeErrorMessage,
  toText,
  type AuthenticatedUser,
  type StripeConnectOnboardingPayload,
  type SupabaseClientLike,
  writeAuditLog,
} from "../_shared/stripe-connect.ts";

const FUNCTION_NAME = "stripe-connect-onboarding-link";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect onboarding-link requests." });
  }

  let adminClient: SupabaseClientLike | null = null;
  let currentUser: AuthenticatedUser | null = null;

  try {
    const { supabaseAnonKey, supabaseUrl } = createAuthClient();
    const authResult = await authenticateRequest(req, supabaseUrl, supabaseAnonKey);
    if ("error" in authResult) return authResult.error;
    currentUser = authResult.user;

    const parsed = await parseJsonPayload<StripeConnectOnboardingPayload>(req);
    if ("error" in parsed) return parsed.error;

    if (hasClientProviderAccountId(parsed.value)) {
      return jsonResponse(400, {
        error: "provider_account_id_not_allowed",
        message: "Provider account ids are backend-owned and are not accepted from the client.",
      });
    }

    const requestedCreatorId = toText(parsed.value.creator_user_id ?? parsed.value.creatorUserId);
    if (requestedCreatorId && requestedCreatorId !== currentUser.id) {
      return jsonResponse(403, {
        error: "creator_mismatch",
        message: "Creator payout setup can only be requested for the current authenticated creator.",
      });
    }

    const redirectUrls = resolveRedirectUrls(parsed.value);
    if ("error" in redirectUrls) return redirectUrls.error;

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
        onboardingUrlCreated: false,
        message: "A Stripe Connect test-mode account must be created before an onboarding link can be requested.",
      });
    }

    const stripeSecret = readStripeTestSecret();
    if (!stripeSecret.configured) {
      return jsonResponse(
        200,
        notConfiguredPayload(stripeSecret.reason, stripeSecret.message, {
          creatorUserId: currentUser.id,
          onboardingUrlCreated: false,
          providerAccountPresent: true,
        }),
      );
    }

    const link = await createStripeConnectOnboardingLink(
      stripeSecret.secret,
      payoutAccount.provider_account_id,
      redirectUrls.value.returnUrl,
      redirectUrls.value.refreshUrl,
    );
    const onboardingUrl = toText(link.url);
    if (!onboardingUrl) throw new Error("Stripe onboarding link response did not include a URL.");

    const expiresAt = onboardingLinkExpiresAt(link.expires_at);
    const auditLogId = await writeAuditLog(adminClient, {
      action: "stripe_connect_onboarding_link_created",
      actorEmail: currentUser.email,
      actorUserId: currentUser.id,
      metadata: {
        expires_at: expiresAt,
        function_name: FUNCTION_NAME,
        onboarding_url_returned: true,
        onboarding_url_stored: false,
        provider_account_id: payoutAccount.provider_account_id,
        refresh_url_origin: safeUrlOrigin(redirectUrls.value.refreshUrl),
        return_url_origin: safeUrlOrigin(redirectUrls.value.returnUrl),
      },
      targetId: payoutAccount.id,
      targetType: "creator_payout_account",
      targetUserId: currentUser.id,
    });

    await insertOnboardingSession(adminClient, {
      account: payoutAccount,
      auditLogId,
      createdByUserId: currentUser.id,
      expiresAt,
      refreshUrl: redirectUrls.value.refreshUrl,
      returnUrl: redirectUrls.value.returnUrl,
    });
    await markOnboardingStarted(adminClient, payoutAccount, auditLogId);

    return jsonResponse(200, {
      status: "link_created",
      provider: "stripe",
      providerKey: "stripe_connect",
      mode: "test",
      liveMoneyAction: false,
      creatorUserId: currentUser.id,
      providerAccountPresent: true,
      providerCall: true,
      providerWrite: true,
      onboardingUrlCreated: true,
      onboardingUrlStored: false,
      onboarding_url: onboardingUrl,
      expires_at: expiresAt,
      payoutCreated: false,
      transferCreated: false,
      checkoutCreated: false,
      audit: {
        linkCreated: true,
        auditLogId,
      },
      message: "Stripe Connect test-mode onboarding link was created. Payout execution remains inactive.",
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
      error: "stripe_connect_onboarding_link_failed",
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
      mode: "test",
      provider: "stripe",
      providerKey: "stripe_connect",
    });
  }
});
