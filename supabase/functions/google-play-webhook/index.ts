import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  GooglePlayAdapter,
  createAdminClient,
  hashText,
  jsonResponse,
  optionsResponse,
  readOptionalEnv,
  sanitizeErrorMessage,
  verifySharedWebhookSecret,
  writeProviderReadinessAudit,
} from "../_shared/provider-readiness.ts";

const FUNCTION_NAME = "google-play-webhook";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use POST for Google Play webhook requests." });
  }

  const webhookSecret = readOptionalEnv("GOOGLE_PLAY_WEBHOOK_SECRET");
  const adapter = new GooglePlayAdapter({
    configured: !!webhookSecret,
    configuredSummary: "Google Play webhook secret is configured server-side.",
    missingSummary: "Google Play webhook secret is not configured server-side.",
  });
  const safeStatus = adapter.getSafeStatus();

  if (!webhookSecret) {
    return jsonResponse(200, {
      status: "setup_required",
      provider: "google_play",
      capability: "google_play_subscription_product",
      signatureVerified: false,
      webhookProcessed: false,
      subscriptionGranted: false,
      liveMoneyAction: false,
      message: safeStatus.safeSummary,
    });
  }

  try {
    const rawBody = await req.text();
    const signatureVerified = verifySharedWebhookSecret(req, webhookSecret);
    const adminConfig = createAdminClient();

    if (!signatureVerified) {
      if (adminConfig.configured) {
        await writeProviderReadinessAudit(adminConfig.client, {
          provider: "google_play",
          capability: "google_play_subscription_product",
          action: "google_play_webhook_rejected",
          statusAfter: "blocked",
          reason: "Google Play webhook rejected because the shared webhook secret did not match.",
          proofSource: FUNCTION_NAME,
          metadata: {
            signature_verified: false,
          },
        });
      }

      return jsonResponse(401, {
        error: "invalid_signature",
        provider: "google_play",
        capability: "google_play_subscription_product",
        signatureVerified: false,
        webhookProcessed: false,
        subscriptionGranted: false,
        liveMoneyAction: false,
        message: "Google Play webhook verification failed.",
      });
    }

    if (adminConfig.configured) {
      await writeProviderReadinessAudit(adminConfig.client, {
        provider: "google_play",
        capability: "google_play_subscription_product",
        action: "google_play_webhook_received",
        statusAfter: "configured",
        reason: "Google Play webhook shell received a verified event. Subscription grants remain on the existing provider path.",
        proofSource: FUNCTION_NAME,
        metadata: {
          raw_event_hash: await hashText(rawBody),
          raw_provider_payload_stored: false,
          subscription_granted: false,
        },
      });
    }

    return jsonResponse(200, {
      status: "ignored",
      provider: "google_play",
      capability: "google_play_subscription_product",
      signatureVerified: true,
      webhookProcessed: true,
      subscriptionGranted: false,
      liveMoneyAction: false,
      message: "Google Play webhook was verified and recorded for readiness only. Subscription entitlement changes are not handled by this scaffold.",
    });
  } catch (error) {
    return jsonResponse(200, {
      status: "error",
      provider: "google_play",
      capability: "google_play_subscription_product",
      signatureVerified: false,
      webhookProcessed: false,
      subscriptionGranted: false,
      liveMoneyAction: false,
      message: sanitizeErrorMessage(error),
    });
  }
});
