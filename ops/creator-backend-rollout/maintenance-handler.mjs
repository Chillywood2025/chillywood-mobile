export const MAINTENANCE_MARKER = "creator-backend-rollout-v1";

// Deliberately no client, environment access, logging, storage, or provider I/O.
// OPTIONS also fails: this window must not authorize new browser operations.
export function maintenanceResponse() {
  return new Response(JSON.stringify({
    status: "temporarily_unavailable",
    reason: "creator_backend_maintenance",
    retryable: true,
    deploymentMarker: MAINTENANCE_MARKER,
    webhookProcessed: false,
    checkoutCreated: false,
    liveMoneyAction: false,
    message: "Service is temporarily unavailable. Retry this same operation later.",
  }), {
    status: 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Chillywood-Deployment": MAINTENANCE_MARKER,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-chillywood-platform, stripe-signature",
      "Access-Control-Expose-Headers": "Retry-After, X-Chillywood-Deployment",
    },
  });
}
