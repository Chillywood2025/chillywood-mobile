import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const owner = read("supabase/functions/cognitive-owner-approval/index.ts");
const worker = read(
  "supabase/functions/cognitive-approved-action-worker/index.ts",
);
const evaluator = read(
  "supabase/functions/cognitive-independent-evaluator/index.ts",
);
const runbook = read(
  "docs/intelligence/COGNITIVE_EDGE_DEPLOYMENT_RUNBOOK.md",
);

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};
const contains = (text, needle, message) =>
  assert(text.includes(needle), message);
const notContains = (text, needle, message) =>
  assert(!text.includes(needle), message);

contains(
  owner,
  '"governance_record_bootstrap_approval"',
  "Owner endpoint is missing the zero-state approval RPC",
);
contains(
  owner,
  'action === "record_bootstrap_approval"',
  "Owner endpoint is missing the closed bootstrap approval action",
);
notContains(
  owner,
  "SUPABASE_SERVICE_ROLE_KEY",
  "Owner endpoint can read service-role material",
);
notContains(
  owner,
  "governance_claim_bootstrap_control_plane",
  "Owner endpoint can claim bootstrap execution",
);

contains(
  worker,
  'const BOOTSTRAP_PHASES = new Set(["claim", "stage", "complete"])',
  "worker bootstrap phases are not a closed set",
);
contains(
  worker,
  'action === "bootstrap_control_plane"',
  "worker is missing the singular bootstrap action",
);
contains(
  worker,
  '"governance_claim_bootstrap_control_plane"',
  "worker is missing the bootstrap claim RPC",
);
contains(
  worker,
  '"governance_stage_bootstrap_control_plane"',
  "worker is missing the non-live bootstrap stage RPC",
);
contains(
  worker,
  '"governance_complete_bootstrap_control_plane"',
  "worker is missing the evaluator-gated bootstrap completion RPC",
);
contains(
  worker,
  'p_target_resource_hash: await bootstrapTargetHash(payload)',
  "worker claim accepts rather than derives the bootstrap target",
);
contains(
  worker,
  '"bootstrap_control_plane",',
  "canonical bootstrap hash is missing the operation",
);
notContains(
  worker,
  "governance_record_bootstrap_approval",
  "worker can record bootstrap Owner approval",
);
notContains(
  worker,
  "governance_record_bootstrap_evaluator_proof",
  "worker can self-attest bootstrap evaluator proof",
);
notContains(
  worker,
  "cognitive_bootstrap_level01_canary",
  "worker can invoke the legacy direct bootstrap",
);

contains(
  evaluator,
  '"governance_record_bootstrap_evaluator_proof"',
  "evaluator is missing the bootstrap proof RPC",
);
contains(
  evaluator,
  'action === "record_bootstrap_evaluator_proof"',
  "evaluator is missing the closed bootstrap proof action",
);
notContains(
  evaluator,
  "governance_claim_bootstrap_control_plane",
  "evaluator can claim bootstrap execution",
);
notContains(
  evaluator,
  "governance_stage_bootstrap_control_plane",
  "evaluator can stage bootstrap execution",
);
notContains(
  evaluator,
  "governance_complete_bootstrap_control_plane",
  "evaluator can complete bootstrap execution",
);

for (const [label, source] of [
  ["Owner", owner],
  ["worker", worker],
  ["evaluator", evaluator],
]) {
  notContains(source, "console.log", `${label} endpoint logs request material`);
  notContains(source, "console.error", `${label} endpoint logs errors`);
}

contains(
  runbook,
  "It creates\n   no live task, project, constitution, switch, schedule, or emergency state.",
  "runbook does not state the non-live staging boundary",
);
contains(
  runbook,
  "every switch and schedule off",
  "runbook does not preserve all-off bootstrap completion",
);
contains(
  runbook,
  "no legacy bootstrap or\n    direct service-role SQL is used",
  "runbook does not reject the legacy/direct bootstrap path",
);

if (failures.length > 0) {
  console.error("cognitive bootstrap Edge contract failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("cognitive bootstrap Edge contract passed");
