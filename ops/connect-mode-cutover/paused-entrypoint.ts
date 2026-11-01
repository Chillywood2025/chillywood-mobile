// Module-local declaration for the deployed Deno runtime; no app-global shim.
export {};
declare const Deno: { serve(handler: (request: Request) => Response): unknown };

// Deployment-only admission pause, never the steady-state provider handler.
// Preserve the target function's existing gateway/JWT settings when staging.
// No imports, credentials, request-body reads, provider calls or DB writes.
Deno.serve((request: Request) => new Response(
  request.method === "OPTIONS" ? null : JSON.stringify({
    status: "setup_temporarily_paused", liveMoneyAction: false,
    message: "Payout account setup is temporarily paused for a safe update. Please retry later.",
  }), {
    status: request.method === "OPTIONS" ? 204 : 503,
    headers: {
      "Content-Type": "application/json", "Retry-After": "60",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "X-Chillywood-Setup-Admission": "paused-connect-mode-cutover-v1",
    },
  },
));
