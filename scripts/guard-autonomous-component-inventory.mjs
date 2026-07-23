import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const inventoryPath = path.join(root, "config/autonomy/autonomous-components.json");
const fail = (message) => {
  process.stderr.write(`guard:autonomous-component-inventory failed: ${message}\n`);
  process.exit(1);
};
if (!fs.existsSync(inventoryPath)) fail("inventory_missing");

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const validTypes = new Set([
  "top_level_system",
  "registered_surface",
  "protected_control_plane",
  "non_autonomous_utility",
  "foundation_only_off",
]);
const validDeploymentStates = new Set([
  "source_complete",
  "template_disabled",
  "deployed_protected_worker",
  "deployed",
  "foundation_only_off",
  "existing_protected_service",
  "non_autonomous",
  "manual_only",
  "security_hardening_in_progress",
  "security_hardened_scaffold_not_deployed",
]);
const requiredFields = [
  "id", "owningSystem", "componentType", "supportedPlatforms", "paths",
  "schedulerCadence", "allowedReads", "allowedWrites", "forbiddenScope",
  "approvalLevel", "proof", "guard", "killSwitch", "rollback",
  "deploymentState", "physicalProofRequired",
];
const components = Array.isArray(inventory.components) ? inventory.components : [];
if (!components.length) fail("components_missing");
const ids = new Set();
const coveredPaths = new Set();
for (const component of components) {
  for (const field of requiredFields) {
    if (!(field in component)) fail(`${component.id ?? "unknown"}:${field}_missing`);
  }
  if (ids.has(component.id)) fail(`${component.id}:duplicate_component_id`);
  ids.add(component.id);
  if (!validTypes.has(component.componentType)) fail(`${component.id}:invalid_component_type`);
  if (!validDeploymentStates.has(component.deploymentState)) fail(`${component.id}:invalid_or_stale_deployment_state:${component.deploymentState}`);
  if (!Array.isArray(component.supportedPlatforms) || !component.supportedPlatforms.length) fail(`${component.id}:supported_platforms_missing`);
  if (!component.supportedPlatforms.every((platform) => ["shared", "ios", "android", "web", "unknown"].includes(platform))) fail(`${component.id}:invalid_platform`);
  if (!Array.isArray(component.paths) || !component.paths.length) fail(`${component.id}:paths_missing`);
  for (const relative of component.paths) {
    coveredPaths.add(relative);
    if (!fs.existsSync(path.join(root, relative))) fail(`${component.id}:missing_path:${relative}`);
  }
}

for (const deployedComponent of [
  "release_provider_readback_adapters",
  "observability_provider_readback_adapter",
  "ios_installed_qa_readiness",
  "user_report_router",
]) {
  const component = components.find((entry) => entry.id === deployedComponent);
  if (component?.deploymentState !== "deployed") fail(`${deployedComponent}:deployed_component_not_recorded_as_deployed`);
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(absolute) : [path.relative(root, absolute)];
});
const systemdUnits = walk(path.join(root, "ops")).filter((relative) => /\.(service|timer)$/u.test(relative));
for (const relative of systemdUnits) {
  if (!coveredPaths.has(relative)) fail(`orphan_systemd_unit:${relative}`);
}

const scheduledWorkflowFiles = [path.join(root, ".github", "workflows"), path.join(root, "ops")]
  .filter((directory) => fs.existsSync(directory))
  .flatMap((directory) => walk(directory))
  .filter((relative) => /\.(?:yml|yaml)$/u.test(relative))
  .filter((relative) => /(?:^|\n)\s*schedule\s*:/mu.test(fs.readFileSync(path.join(root, relative), "utf8")));
for (const relative of scheduledWorkflowFiles) {
  if (!coveredPaths.has(relative)) fail(`orphan_scheduled_workflow:${relative}`);
}

const scheduledWorkerFiles = walk(path.join(root, "workers"))
  .filter((relative) => /(?:worker\.mjs|wrangler\.toml)$/u.test(relative))
  .filter((relative) => /(?:async\s+scheduled\s*\(|\bcrons\s*=)/u.test(fs.readFileSync(path.join(root, relative), "utf8")));
for (const relative of scheduledWorkerFiles) {
  if (!coveredPaths.has(relative)) fail(`orphan_scheduled_worker:${relative}`);
}

const longRunningOpsWorkers = walk(path.join(root, "ops"))
  .filter((relative) => /worker\.(?:mjs|js|ts)$/u.test(relative))
  .filter((relative) => /(?:while\s*\(true\)|SCAN_POLL_INTERVAL|claim_[a-z0-9_]+_jobs)/u.test(fs.readFileSync(path.join(root, relative), "utf8")));
for (const relative of longRunningOpsWorkers) {
  if (!coveredPaths.has(relative)) fail(`orphan_queue_worker:${relative}`);
}

const scheduledMigrations = walk(path.join(root, "supabase", "migrations"))
  .filter((relative) => relative.endsWith(".sql"))
  .filter((relative) => /cron\.?(?:"schedule"|schedule)\s*\(/u.test(fs.readFileSync(path.join(root, relative), "utf8")));
for (const relative of scheduledMigrations) {
  if (!coveredPaths.has(relative)) fail(`orphan_database_scheduler:${relative}`);
}

const operatorLikeFunctions = [
  "autonomous-approval-request",
  "chilly-chat-call-transition-retry",
  "installed-product-qa-operator",
  "livekit-heartbeat-monitor",
  "livekit-operator",
  "moderation-safety-operator",
  "money-operator",
  "notification-operator",
  "observability-operator",
  "owner-command-operator",
  "platform-recovery-operator",
  "privacy-compliance-operator",
  "release-operator",
  "search-ranking-integrity-operator",
  "security-owner-operator",
  "support-success-operator",
  "user-report-intake",
];
for (const name of operatorLikeFunctions) {
  const relative = `supabase/functions/${name}/index.ts`;
  if (!coveredPaths.has(relative)) fail(`orphan_operator_function:${relative}`);
}

for (const required of [
  ["chilly-chat-call-transition-retry", "ios_terminal_call_delivery_retry"],
  ["user-report-intake", "user_report_router"],
  ["autonomous-approval-request", "autonomous_approval_control_plane"],
  ["livekit-heartbeat-monitor", "livekit_heartbeat_monitor"],
  ["installed-qa-firebase-test-lab", "android_firebase_test_lab_installed_qa"],
  ["ops-alert-automation", "ops_alert_automation_control_plane"],
  ["product-intelligence", "product_intelligence_operator"],
  ["research-source-broker", "research_source_broker"],
  ["intelligence-memory", "intelligence_memory_service"],
  ["architecture-knowledge-graph", "architecture_knowledge_graph"],
  ["software-engineering-executor", "software_engineering_executor"],
  ["independent-evaluation-judge", "independent_evaluation_judge"],
]) {
  if (!ids.has(required[1])) fail(`required_component_missing:${required[0]}`);
}

process.stdout.write(`guard:autonomous-component-inventory passed (${components.length} components, ${systemdUnits.length} systemd units)\n`);
