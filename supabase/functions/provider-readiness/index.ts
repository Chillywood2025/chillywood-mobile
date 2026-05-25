import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authenticateBearerUser,
  createAdminClient,
  jsonResponse,
  missingProviderStatus,
  optionsResponse,
  readProviderReadinessRows,
  sanitizeErrorMessage,
  writeProviderReadinessAudit,
} from "../_shared/provider-readiness.ts";

const FUNCTION_NAME = "provider-readiness";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed", message: "Use GET or POST to check readiness." });
  }

  try {
    const adminConfig = createAdminClient();
    if (!adminConfig.configured) {
      return jsonResponse(200, {
        status: "setup_needed",
        liveMoneyAction: false,
        rows: [
          missingProviderStatus(
            "internal_policy",
            "creator_monetization_policy",
            "Server readiness checks are not configured.",
          ),
        ],
      });
    }

    const auth = await authenticateBearerUser(adminConfig.client, req.headers.get("authorization"));
    if (auth.response) return auth.response;

    const rows = await readProviderReadinessRows(adminConfig.client);
    await writeProviderReadinessAudit(adminConfig.client, {
      actorUserId: auth.user?.id ?? null,
      action: "provider_readiness_edge_summary_requested",
      reason: "Sanitized provider readiness summary requested through Edge Function.",
      proofSource: FUNCTION_NAME,
      metadata: {
        rows_returned: rows.length,
        raw_provider_payload_returned: false,
        secret_values_returned: false,
      },
    });

    return jsonResponse(200, {
      status: "ok",
      liveMoneyAction: false,
      rows,
    });
  } catch (error) {
    return jsonResponse(200, {
      status: "error",
      liveMoneyAction: false,
      rows: [
        missingProviderStatus(
          "internal_policy",
          "creator_monetization_policy",
          "Readiness checks are temporarily unavailable.",
        ),
      ],
      message: sanitizeErrorMessage(error),
    });
  }
});
