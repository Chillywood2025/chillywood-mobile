const DEFAULT_OPERATOR_ACTION = "watch_once";

const redact = (value) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");

const safeSummary = (payload, status, source) => ({
  eligibleServerCount: payload?.routerHealth?.eligibleServerCount ?? null,
  executionStatus: payload?.execution?.status ?? null,
  healthState: payload?.routerHealth?.healthState ?? null,
  ok: payload?.ok === true,
  plannedAction: payload?.plan?.action ?? null,
  reason: payload?.routerHealth?.reason ?? payload?.error ?? null,
  source,
  status,
});

const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  status,
});

const runWatchOnce = async (env, source) => {
  const functionUrl = String(env.LIVEKIT_OPERATOR_FUNCTION_URL ?? "").trim();
  const operatorToken = String(env.LIVEKIT_OPERATOR_TOKEN ?? "").trim();
  if (!functionUrl || !operatorToken) {
    const summary = {
      ok: false,
      reason: "operator_scheduler_config_missing",
      source,
      status: 0,
    };
    console.error("livekit-operator-scheduler", JSON.stringify(summary));
    return summary;
  }

  const response = await fetch(functionUrl, {
    body: JSON.stringify({
      action: DEFAULT_OPERATOR_ACTION,
      enable_safe_recovery: env.LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY === "true",
      scheduler: "cloudflare_cron",
      source,
    }),
    headers: {
      "Content-Type": "application/json",
      "x-livekit-operator-token": operatorToken,
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({ error: "invalid_json_response" }));
  const summary = safeSummary(payload, response.status, source);
  console.log("livekit-operator-scheduler", redact(JSON.stringify(summary)));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`livekit_operator_watch_once_failed:${response.status}:${summary.reason ?? "unknown"}`);
  }
  return summary;
};

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runWatchOnce(env, `cloudflare_cron:${event.cron}`));
  },

  async fetch() {
    return json({
      ok: true,
      service: "chillywood-livekit-operator-scheduler",
      workersDev: false,
    });
  },
};
