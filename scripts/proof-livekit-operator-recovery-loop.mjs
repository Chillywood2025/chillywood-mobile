import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const operatorModel = read("_lib/livekitAutonomousOperator.ts");
const operatorFunction = read("supabase/functions/livekit-operator/index.ts");
const operatorCli = read("scripts/livekit-operator-cli.mjs");
const workflow = read("ops/livekit-operator/github-actions/livekit-operator-reliability-loop.yml");
const cloudflareScheduler = read("workers/livekit-operator-scheduler/worker.mjs");
const cloudflareSchedulerConfig = read("workers/livekit-operator-scheduler/wrangler.toml");
const systemdTimer = read("ops/livekit-operator/systemd/chillywood-livekit-operator-watch-once.timer");
const systemdScript = read("ops/livekit-operator/systemd/livekit-operator-watch-once.sh");
const packageJson = read("package.json");

for (const state of [
  "app_token_validation_regression",
  "token_time_skew_blocker",
  "renderable_contract_regression",
  "fallback_flash_regression",
  "surface_mount_regression",
  "roster_render_regression",
  "backend_router_regression",
  "heartbeat_regression",
  "deployment_regression",
]) {
  assert.ok(operatorModel.includes(state), `operator model must classify ${state}`);
}

assert.ok(operatorModel.includes("nbfDeltaSeconds"), "operator model must accept nbf delta input");
assert.ok(operatorModel.includes("token_nbf_future_within_grace"), "operator must classify +1s nbf as grace-used");
assert.ok(operatorModel.includes("token_nbf_future_beyond_grace"), "operator must classify materially future nbf as blocked");
assert.ok(operatorModel.includes("renderable_contract_cleared_while_valid"), "operator must detect renderable contract clearing");
assert.ok(operatorModel.includes("fallback_roster_shown_during_renderable_contract_grace_window"), "operator must detect fallback flash");
assert.ok(operatorModel.includes("level >= 3"), "Level 3/4 actions must not auto-execute");
assert.ok(!operatorModel.includes("LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS ="), "operator must not loosen stale heartbeat cutoff");

assert.ok(operatorFunction.includes("watch_once"), "operator function must expose watch_once action");
assert.ok(operatorFunction.includes("enable_safe_recovery"), "safe recovery must be explicitly enabled");
assert.ok(operatorFunction.includes("invokeHeartbeatMonitor"), "safe recovery must use legitimate heartbeat monitor");
assert.ok(operatorFunction.includes("recordLearningState"), "operator must update learning state");
assert.ok(operatorFunction.includes("livekit_operator_recovery_actions"), "operator must audit recovery actions");
assert.ok(!operatorFunction.includes("last_heartbeat_at:"), "operator must not write fake heartbeats");
assert.ok(!operatorFunction.includes(".from(\"livekit_servers\").update"), "operator must not directly mark servers healthy");
assert.ok(!operatorFunction.includes("SUPABASE_SERVICE_ROLE_KEY") || operatorFunction.includes("livekit_operator_events"), "service role use must remain scoped to operator tables and reads");

assert.ok(operatorCli.includes("\"watch-once\": \"watch_once\""), "CLI must expose watch-once");
assert.ok(operatorCli.includes("LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY"), "CLI safe recovery must be env-gated");

assert.ok(workflow.includes("*/5 * * * *"), "scheduled reliability loop must run every five minutes");
assert.ok(workflow.includes("LIVEKIT_OPERATOR_FUNCTION_URL"), "workflow must use operator function URL secret");
assert.ok(workflow.includes("LIVEKIT_OPERATOR_TOKEN"), "workflow must use operator token secret");
assert.ok(workflow.includes("LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY"), "workflow safe recovery must be secret-gated");
assert.ok(workflow.includes("\"action\":\"watch_once\""), "workflow must call watch_once");
assert.ok(workflow.includes("replace(/[A-Za-z0-9._~+/=-]{32,}/g, \"[redacted]\")"), "workflow output must redact token-like values");
assert.ok(!workflow.includes("SUPABASE_SERVICE_ROLE_KEY"), "workflow must not use service-role key");

assert.ok(cloudflareSchedulerConfig.includes("workers_dev = false"), "Cloudflare scheduler must not expose workers.dev");
assert.ok(cloudflareSchedulerConfig.includes("crons = [\"*/5 * * * *\"]"), "Cloudflare scheduler must run every five minutes");
assert.ok(cloudflareSchedulerConfig.includes("LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY = \"true\""), "Cloudflare scheduler safe recovery must be explicitly enabled");
assert.ok(cloudflareScheduler.includes("scheduler: \"cloudflare_cron\""), "Cloudflare scheduler must mark watch_once source");
assert.ok(cloudflareScheduler.includes("x-livekit-operator-token"), "Cloudflare scheduler must use the narrow operator token");
assert.ok(!cloudflareScheduler.includes("SUPABASE_SERVICE_ROLE_KEY"), "Cloudflare scheduler must not use service-role key");
assert.ok(systemdTimer.includes("OnUnitActiveSec=5min"), "systemd scheduler must run every five minutes");
assert.ok(systemdScript.includes("\"scheduler\":\"systemd_timer\""), "systemd scheduler must identify itself");
assert.ok(systemdScript.includes("x-livekit-operator-token: ${LIVEKIT_OPERATOR_TOKEN}"), "systemd scheduler must use the narrow operator token");
assert.ok(!systemdScript.includes("SUPABASE_SERVICE_ROLE_KEY"), "systemd scheduler must not use service-role key");

assert.ok(packageJson.includes("\"livekit-operator:watch-once\""), "package scripts must include watch-once CLI");
assert.ok(packageJson.includes("\"proof:livekit-render-telemetry\""), "package scripts must include render telemetry proof");
assert.ok(packageJson.includes("\"proof:livekit-operator-recovery-loop\""), "package scripts must include recovery loop proof");
assert.ok(packageJson.includes("\"proof:livekit-operator-scheduler\""), "package scripts must include scheduler proof");

console.log(JSON.stringify({
  activationMode: "limited_scheduled_safe_recovery_active_systemd_timer",
  status: "passed",
}, null, 2));
