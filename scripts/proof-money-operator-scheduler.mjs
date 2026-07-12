#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.resolve(root, file), "utf8");

const registry = read("_lib/autonomousSystemsRegistry.ts");
const registryDoc = read("docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md");
const moneyOperator = read("supabase/functions/money-operator/index.ts");
const service = read("ops/money-operator/systemd/chillywood-money-operator-watch-once.service");
const timer = read("ops/money-operator/systemd/chillywood-money-operator-watch-once.timer");
const watchScript = read("ops/money-operator/systemd/money-operator-watch-once.sh");
const packageJson = JSON.parse(read("package.json"));

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

check("money scheduled registry status", registry.includes('id: "money_flow_control"') && registry.includes('activeActivationMode: "limited_scheduled_probe"') && registry.includes("chillywood-money-operator-watch-once.timer_every_10_minutes"));
check("money scheduled registry docs", registryDoc.includes("chillywood-money-operator-watch-once.timer_every_10_minutes"));
check("package proof script", Boolean(packageJson.scripts?.["proof:money-operator-scheduler"]));
check("package guard script", Boolean(packageJson.scripts?.["guard:money-operator-scheduler"]));
check("watch once action writes scheduler identity", moneyOperator.includes("const scheduler = safeLabel(payload.scheduler") && moneyOperator.includes("operator_id: operatorId") && moneyOperator.includes("high_risk_executed: false"));
check("systemd hardening", ["NoNewPrivileges=true", "ProtectSystem=strict", "PrivateTmp=true", "RestrictSUIDSGID=true", "LockPersonality=true", "CapabilityBoundingSet="].every((needle) => service.includes(needle)));
check("timer cadence", timer.includes("OnUnitActiveSec=10min") && timer.includes("RandomizedDelaySec=45s"));
check("watch script scoped action", watchScript.includes('"action":"watch_once"') && watchScript.includes('"scheduler":"systemd_timer"') && watchScript.includes('"operator_id":"money_flow_control"'));
check("watch script blocks money movement", watchScript.includes('"moneyMoved":false') && watchScript.includes('"highRiskExecuted":false'));
check("no service role in systemd", !/SERVICE_ROLE|SUPABASE_SERVICE_ROLE_KEY|--service-role/i.test(service + "\n" + timer + "\n" + watchScript));
check("no money movement commands", !/checkout|payment_link|transfer|payout|cashout|invoice|manual_premium_grant/i.test(watchScript));

if (failures.length) {
  console.error(JSON.stringify({ ok: false, system: "money_flow_control", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  system: "money_flow_control",
  scheduler: "chillywood-money-operator-watch-once.timer_every_10_minutes",
  action: "watch_once",
  moneyMoved: false,
  highRiskExecuted: false,
}, null, 2));
