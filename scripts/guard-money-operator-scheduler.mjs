#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const moneyOperator = read("supabase/functions/money-operator/index.ts");
const service = read("ops/money-operator/systemd/chillywood-money-operator-watch-once.service");
const timer = read("ops/money-operator/systemd/chillywood-money-operator-watch-once.timer");
const watchScript = read("ops/money-operator/systemd/money-operator-watch-once.sh");
const packageJson = JSON.parse(read("package.json"));

const failures = [];
if (!registry.includes('activeActivationMode: "limited_scheduled_probe"') || !registry.includes("chillywood-money-operator-watch-once.timer_every_10_minutes")) failures.push("money_scheduler_registry_missing");
if (!packageJson.scripts?.["proof:money-operator-scheduler"] || !packageJson.scripts?.["guard:money-operator-scheduler"]) failures.push("money_scheduler_package_scripts_missing");
if (!moneyOperator.includes("scheduler") || !moneyOperator.includes("operator_id") || !moneyOperator.includes("high_risk_executed")) failures.push("money_watch_once_audit_identity_missing");
for (const hardening of ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet="]) {
  if (!service.includes(hardening)) failures.push(`systemd_hardening_missing:${hardening}`);
}
if (!service.includes("EnvironmentFile=/etc/chillywood/money-operator.env") || !service.includes("ExecStart=/opt/chillywood/money-operator/money-operator-watch-once.sh")) failures.push("systemd_service_not_scoped");
if (!timer.includes("OnUnitActiveSec=10min") || !timer.includes("RandomizedDelaySec=45s")) failures.push("timer_cadence_missing");
if (!watchScript.includes('"action":"watch_once"') || !watchScript.includes('"scheduler":"systemd_timer"') || !watchScript.includes('"operator_id":"money_flow_control"')) failures.push("watch_script_not_watch_once_with_identity");
if (/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|--service-role/i.test(service + "\n" + timer + "\n" + watchScript)) failures.push("service_role_in_systemd");
if (/checkout|payment_link|transfer|payout|cashout|invoice|manual_premium_grant|mark_paid/i.test(watchScript)) failures.push("money_movement_command_in_scheduler");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: "money_flow_control", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: "money_flow_control",
  guard: "money_operator_scheduler_boundaries_enforced",
  moneyMoved: false,
}, null, 2));
