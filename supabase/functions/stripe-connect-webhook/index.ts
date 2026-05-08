import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
} as const;

const PROVIDER = "stripe_connect";
const MODE = "test";

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    headers: JSON_HEADERS,
    status,
  });

const sanitizeErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown Stripe Connect webhook skeleton error.");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9._~+/=-]{24,}/g, "[redacted]")
    .slice(0, 240);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS, status: 200 });
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST for Stripe Connect webhook skeleton requests." });
  }

  try {
    return json(200, {
      status: "not_configured",
      provider: PROVIDER,
      mode: MODE,
      liveMoneyAction: false,
      signatureVerified: false,
      eventStored: false,
      providerWrite: false,
      transferCreated: false,
      payoutCreated: false,
      audit: {
        written: false,
        requiredLater: true,
      },
      message: "Stripe Connect webhook handling is skeleton-only in this foundation pass. No signature was verified and no event was stored.",
    });
  } catch (error) {
    return json(500, {
      error: "stripe_connect_webhook_skeleton_failed",
      message: sanitizeErrorMessage(error),
    });
  }
});
