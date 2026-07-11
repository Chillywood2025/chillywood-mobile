#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const worker = read("workers/livekit-operator-scheduler/worker.mjs");
const wrangler = read("workers/livekit-operator-scheduler/wrangler.toml");
const systemdService = read("ops/livekit-operator/systemd/chillywood-livekit-operator-watch-once.service");
const systemdTimer = read("ops/livekit-operator/systemd/chillywood-livekit-operator-watch-once.timer");
const systemdScript = read("ops/livekit-operator/systemd/livekit-operator-watch-once.sh");
const operator = read("supabase/functions/livekit-operator/index.ts");

assert.match(wrangler, /name\s*=\s*"chillywood-livekit-operator-scheduler"/, "scheduler Worker must have the expected name");
assert.match(wrangler, /workers_dev\s*=\s*false/, "scheduler Worker must not expose workers.dev");
assert.match(wrangler, /crons\s*=\s*\["\*\/5 \* \* \* \*"\]/, "scheduler must run every five minutes");
assert.match(wrangler, /LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY\s*=\s*"true"/, "safe recovery must be explicitly gated");
assert.doesNotMatch(wrangler, /routes\s*=/, "scheduler Worker must not define routes");
assert.doesNotMatch(wrangler, /LIVEKIT_OPERATOR_TOKEN\s*=/, "operator token must not be committed in vars");

assert.ok(worker.includes("action: DEFAULT_OPERATOR_ACTION"), "scheduler must call the watch_once action");
assert.ok(worker.includes("x-livekit-operator-token"), "scheduler must use the operator token header");
assert.ok(worker.includes("scheduler: \"cloudflare_cron\""), "scheduler must identify Cloudflare cron source");
assert.ok(worker.includes("redact(JSON.stringify(summary))"), "scheduler logs must redact long token-like values");
assert.ok(worker.includes("throw new Error"), "scheduler must fail the run on unsuccessful operator response");
assert.doesNotMatch(worker, /SUPABASE_SERVICE_ROLE_KEY|service_role|livekit_servers.*update|staleHeartbeatSeconds\s*=/i, "scheduler must not carry DB service-role or routing mutation authority");

assert.ok(operator.includes("action === \"watch_once\""), "operator must handle watch_once");
assert.ok(operator.includes("livekit_operator_events"), "operator must audit watch_once events");
assert.ok(operator.includes("scheduler: body.scheduler"), "operator must preserve redacted scheduler metadata");
assert.doesNotMatch(operator, /fake.*heartbeat/i, "operator must not write fake heartbeats");
assert.doesNotMatch(operator, /insert\([^)]*livekit_servers/i, "operator must not insert server rows");

assert.ok(systemdTimer.includes("OnUnitActiveSec=5min"), "systemd timer must run every five minutes");
assert.ok(systemdTimer.includes("RandomizedDelaySec=15s"), "systemd timer should include jitter");
assert.ok(systemdService.includes("EnvironmentFile=/etc/chillywood/livekit-operator.env"), "systemd service must read token from host env file");
assert.ok(systemdService.includes("NoNewPrivileges=true"), "systemd service must be privilege restricted");
assert.ok(systemdService.includes("ProtectSystem=strict"), "systemd service must protect host filesystem");
assert.ok(systemdService.includes("CapabilityBoundingSet="), "systemd service must not grant Linux capabilities");
assert.ok(systemdScript.includes("\"action\":\"watch_once\""), "systemd script must call watch_once");
assert.ok(systemdScript.includes("\"scheduler\":\"systemd_timer\""), "systemd script must identify systemd source");
assert.ok(systemdScript.includes("x-livekit-operator-token: ${LIVEKIT_OPERATOR_TOKEN}"), "systemd script must use operator token from env");
assert.ok(systemdScript.includes("sed -E 's/[A-Za-z0-9._~+\\/=-]{32,}/[redacted]/g'"), "systemd script must redact long token-like values");
assert.ok(systemdScript.includes('grep -Eq \'"ok"[[:space:]]*:[[:space:]]*true\''), "systemd script must fail when operator ok is not true");
assert.doesNotMatch(systemdScript, /SUPABASE_SERVICE_ROLE_KEY|service_role|livekit_servers.*update|staleHeartbeatSeconds\s*=/i, "systemd scheduler must not carry DB service-role or routing mutation authority");

console.log(JSON.stringify({
  activationMode: "limited_scheduled_safe_recovery_active_systemd_timer",
  cron: "*/5 * * * *",
  status: "passed",
}, null, 2));
