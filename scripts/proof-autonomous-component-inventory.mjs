import fs from "node:fs";

const inventory = JSON.parse(fs.readFileSync("config/autonomy/autonomous-components.json", "utf8"));
const components = inventory.components ?? [];
const byType = Object.fromEntries(inventory.classifications.map((type) => [type, components.filter((component) => component.componentType === type).length]));
const platforms = Object.fromEntries(["shared", "ios", "android", "web", "unknown"].map((platform) => [platform, components.filter((component) => component.supportedPlatforms.includes(platform)).length]));
const required = [
  "ios_terminal_call_delivery_retry",
  "user_report_router",
  "autonomous_approval_control_plane",
  "owner_command_operator",
  "livekit_heartbeat_monitor",
  "android_firebase_test_lab_installed_qa",
  "ops_alert_automation_control_plane",
  "product_intelligence_operator",
  "rachi_cognitive_orchestration",
  "research_source_broker",
  "intelligence_memory_service",
  "architecture_knowledge_graph",
  "product_experiment_engine",
  "software_engineering_executor",
  "independent_evaluation_judge",
  "capability_and_tool_broker",
  "model_router_and_budget_controller",
];
for (const id of required) {
  if (!components.some((component) => component.id === id)) throw new Error(`missing required component ${id}`);
}
for (const id of ["release_provider_readback_adapters", "observability_provider_readback_adapter", "ios_installed_qa_readiness", "user_report_router"]) {
  if (!components.some((component) => component.id === id && component.deploymentState === "deployed")) {
    throw new Error(`deployed component has stale inventory state: ${id}`);
  }
}
if (!components.some((component) => component.componentType === "non_autonomous_utility")) throw new Error("non-autonomous utility classification missing");
if (!components.some((component) => component.componentType === "foundation_only_off")) throw new Error("foundation-only classification missing");
process.stdout.write(`${JSON.stringify({ ok: true, componentCount: components.length, byType, platforms })}\n`);
