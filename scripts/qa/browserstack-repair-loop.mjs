#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { redactBrowserStackSecrets, redactKnownSecretValues, parseEnvFile } from "./browserstack-env.mjs";

const root = process.cwd();
const purchaseFlows = new Set([
  "monetization-tip-smoke.yaml",
  "monetization-paid-video-smoke.yaml",
  "monetization-watch-party-ticket-smoke.yaml",
  "monetization-event-pass-smoke.yaml",
  "monetization-platform-subscription-smoke.yaml",
  "monetization-vip-smoke.yaml",
]);

const autoFixPatterns = [
  [/testID|resource-id|assertVisible|not visible|No element found|missing selector/i, "selector/testID placement or Maestro assertion"],
  [/timeout|timed out|extendedWaitUntil/i, "Maestro wait/timeout strategy"],
  [/openLink|deep link|No Activity found|route/i, "deep link or route path"],
  [/stale APK|app upload|BROWSERSTACK_APP_ID|custom_id/i, "stale app reference/upload"],
  [/fixture readback|readback script|column|relation|RPC/i, "fixture/readback script"],
  [/env presence|missing_env guard/i, "env presence guard"],
  [/purchase button|assertion too strict|non-purchase smoke/i, "non-purchase smoke assertion"],
];

const humanPatterns = [
  [/purchase_flow_requested|manual_assisted_flow_requested|Google Play|purchase sheet|App Live|HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION/i, "Google Play/App Live manual purchase confirmation"],
  [/RevenueCat|Google Play product|payment product|Premium entitlement|RLS|service-role|LiveKit|host authority|publish authority|production data|broad refactor/i, "high-risk product/security/money change"],
];

const failClosedPatterns = [
  [/BROWSERSTACK_ACCESS_KEY.*missing|BROWSERSTACK_USERNAME.*missing|missing credentials/i, "missing BrowserStack credentials"],
  [/CHILLYWOOD_E2E_.*PASSWORD.*missing|missing E2E account passwords/i, "missing E2E account password"],
  [/SUPABASE_SERVICE_ROLE_KEY.*missing|missing service-role/i, "missing local service-role for fixture setup"],
  [/secret|credentials.*committed|service_role.*app code/i, "secret exposure risk"],
  [/payable ledger|live money|payout authority true|unrelated unlock|fake purchase/i, "money/scope safety violation"],
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    flow: "",
    run: false,
    check: "",
    proofDir: path.join(os.tmpdir(), `chillywood-browserstack-repair-loop-${Date.now()}`),
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--flow") options.flow = path.basename(args[++index] ?? "");
    else if (arg === "--run") options.run = true;
    else if (arg === "--check") options.check = args[++index] ?? "";
    else if (arg === "--proof-dir") options.proofDir = path.resolve(args[++index] ?? "");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function classify(text, flow) {
  if (flow && purchaseFlows.has(flow)) {
    return {
      label: "HUMAN_REQUIRED",
      reason: "Google Play purchase confirmation flow requires manual-assisted App Live proof.",
      safeFixArea: "Use BrowserStack App Live and backend readback; do not automate purchase confirmation.",
    };
  }
  for (const [pattern, reason] of failClosedPatterns) {
    if (pattern.test(text)) return { label: "FAIL_CLOSED", reason, safeFixArea: "Repair env/safety issue before rerun." };
  }
  for (const [pattern, reason] of humanPatterns) {
    if (pattern.test(text)) return { label: "HUMAN_REQUIRED", reason, safeFixArea: "Human approval or manual proof required." };
  }
  for (const [pattern, reason] of autoFixPatterns) {
    if (pattern.test(text)) return { label: "AUTO_FIX_ALLOWED", reason, safeFixArea: reason };
  }
  return {
    label: "FAIL_CLOSED",
    reason: "Unclassified BrowserStack failure. Avoid blind patching.",
    safeFixArea: "Inspect session logs and classify manually.",
  };
}

const options = parseArgs();
mkdirSync(options.proofDir, { recursive: true });

const env = {
  ...process.env,
  ...parseEnvFile(path.join(root, ".env.browserstack-monetization.local")),
  ...parseEnvFile(path.join(root, ".env.browserstack.local")),
};

let command = null;
let result = null;

if (options.check === "fixture-readback") {
  command = ["node", ["scripts/qa/readback-monetization-e2e-fixtures.mjs"]];
} else if (options.flow) {
  command = [
    "node",
    [
      "scripts/qa/run-browserstack-maestro.mjs",
      ...(options.run ? ["--run"] : []),
      "--proof-dir",
      path.join(options.proofDir, "browserstack-run"),
      "--flow",
      options.flow,
    ],
  ];
} else {
  const message = "Provide --flow <name.yaml> or --check fixture-readback.";
  writeFileSync(path.join(options.proofDir, "PROOF_SUMMARY.md"), `# BrowserStack Repair Loop\n\nFAIL_CLOSED\n\n${message}\n`);
  console.log(`FAIL_CLOSED\n${message}`);
  process.exit(2);
}

result = spawnSync(command[0], command[1], {
  cwd: root,
  env,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 20,
});

const rawOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
const safeOutput = redactKnownSecretValues(redactBrowserStackSecrets(rawOutput), env);
writeFileSync(path.join(options.proofDir, "repair_loop_run.log"), safeOutput);

let sessionLinks = "No BrowserStack sessions created.\n";
const nestedLinks = path.join(options.proofDir, "browserstack-run", "session_links.txt");
if (existsSync(nestedLinks)) sessionLinks = readFileSync(nestedLinks, "utf8");
writeFileSync(path.join(options.proofDir, "session_links.txt"), sessionLinks);

const classification = result.status === 0
  ? {
      label: "AUTO_FIX_ALLOWED",
      reason: "Selected check/flow completed. No repair needed unless assertions are missing from the proof goal.",
      safeFixArea: "No fix required.",
    }
  : classify(safeOutput, options.flow);

const proof = {
  ok: result.status === 0,
  exitCode: result.status,
  flow: options.flow || null,
  check: options.check || null,
  proofDir: options.proofDir,
  classification,
  sessionLinks: sessionLinks.trim().split(/\n/).filter(Boolean),
};

writeFileSync(path.join(options.proofDir, "repair_loop_summary.json"), `${JSON.stringify(proof, null, 2)}\n`);
writeFileSync(
  path.join(options.proofDir, "PROOF_SUMMARY.md"),
  `# BrowserStack Repair Loop\n\n${classification.label}\n\n- Reason: ${classification.reason}\n- Safe fix area: ${classification.safeFixArea}\n- Flow: ${options.flow || "n/a"}\n- Check: ${options.check || "n/a"}\n- Exit code: ${result.status}\n`,
);

console.log(`${classification.label}\nreason: ${classification.reason}\nsafe_fix_area: ${classification.safeFixArea}\nproof_dir: ${options.proofDir}`);
process.exit(result.status === 0 ? 0 : classification.label === "AUTO_FIX_ALLOWED" ? 10 : 20);
