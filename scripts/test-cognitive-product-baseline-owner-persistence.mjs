import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "config/intelligence/product-experience-baseline-options-v1.json",
);
const migrationPath = path.join(
  root,
  "supabase/migrations/20260724064000_cognitive_product_baseline_owner_persistence.sql",
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const migration = fs.readFileSync(migrationPath, "utf8");

const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
    );
  }
  return value;
};

const sha256 = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const expectedHashes = new Map([
  ["A", "29b2c09ded4add3fba577e1195d3da20d0e1015ba81e88f73b1319593f0c27c9"],
  ["B", "9e891de1b46cd19405b43178dbd34ed0ea1d96b4eebcc7b404f4f3d9f6ba3dc5"],
  ["C", "0ba4a4ad6d80c0f2aebc588686fb3f7fbf420b9f48f5812077a75137164c3184"],
]);

for (const selectedOption of manifest.options) {
  const canonicalSelection = normalize({
    schemaVersion: manifest.schemaVersion,
    optionsVersion: manifest.optionsVersion,
    scope: manifest.scope,
    commonRequirements: manifest.commonRequirements,
    selectedOption,
  });
  const actualHash = sha256(JSON.stringify(canonicalSelection));
  assert.equal(
    actualHash,
    expectedHashes.get(selectedOption.option),
    `canonical ${selectedOption.option} selection hash drifted`,
  );
  assert.match(
    migration,
    new RegExp(actualHash, "u"),
    `migration does not allowlist canonical ${selectedOption.option}`,
  );
}

assert.equal(
  sha256(fs.readFileSync(manifestPath, "utf8")),
  "7b751a8875b98eb113fda57b9db595aca8e29ca8a970d5b90ac98d2d10dcd8df",
  "baseline options manifest hash drifted",
);

const functionStart = migration.indexOf(
  "create function public.governance_owner_persist_product_experience_baseline",
);
const functionEnd = migration.indexOf(
  "grant execute on function",
  functionStart,
);
assert.ok(functionStart >= 0 && functionEnd > functionStart, "Owner RPC missing");
const ownerFunction = migration.slice(functionStart, functionEnd);

for (
  const required of [
    "governance_assert_exact_owner()",
    "product_experience_baseline_service",
    "visual_experience_canary",
    "governance_approved_execution_evaluator_proofs",
    "proof_value.verdict <> 'passed'",
    "execution_value.state <> 'completed'",
    "decision_value.selected_option_hash <> option_hash_value",
    "execution_value.target_resource_hash <> option_hash_value",
    "approved_execution_count <> 1",
    "now_at >= version_value.expires_at",
    "proof_value.created_at > execution_value.completed_at",
    "approved_execution_id = p_execution_id",
    "'created', false",
  ]
) {
  assert.ok(
    ownerFunction.includes(required),
    `Owner baseline RPC is missing required binding: ${required}`,
  );
}

for (
  const forbidden of [
    "cognitive_governance_switches",
    "cognitive_capabilities",
    "cognitive_tool",
    "github",
    "merge",
    "release",
    "deployment",
    "product_quality_findings",
  ]
) {
  assert.ok(
    !ownerFunction.toLowerCase().includes(forbidden),
    `Owner baseline RPC contains out-of-scope authority: ${forbidden}`,
  );
}

assert.match(
  migration,
  /revoke all on function\s+public\.governance_owner_persist_product_experience_baseline\(uuid,text,text\)\s+from public, anon, authenticated, service_role;/u,
  "Owner RPC must revoke the default and service-role execute paths",
);
assert.match(
  migration,
  /grant execute on function\s+public\.governance_owner_persist_product_experience_baseline\(uuid,text,text\)\s+to authenticated;/u,
  "Owner RPC must be exposed only through the authenticated Owner assertion",
);
assert.match(
  migration,
  /baseline_option is null\s+and status <> 'owner_approved'/u,
  "an Owner-approved baseline cannot use the nullable legacy row shape",
);

console.log("cognitive product baseline Owner persistence contract passed");
