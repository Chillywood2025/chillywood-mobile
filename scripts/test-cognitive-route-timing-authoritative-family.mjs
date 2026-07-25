import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase/migrations/20260725032000_cognitive_route_timing_authoritative_route_family.sql",
);
const baselinePath = path.join(
  root,
  "config/intelligence/chillywood-product-experience-baseline-v1.json",
);
const edgeEvaluatorPath = path.join(
  root,
  "supabase/functions/cognitive-product-quality-evaluator/index.ts",
);
const isolatedEvaluatorPath = path.join(
  root,
  "isolated-runtime/cloudflare/src/adapters/evaluator.mjs",
);
const schedulerPath = path.join(
  root,
  "isolated-runtime/cloudflare/src/adapters/scheduler.mjs",
);

const [migration, baselineRaw, edgeEvaluator, isolatedEvaluator, scheduler] =
  await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(baselinePath, "utf8"),
    readFile(edgeEvaluatorPath, "utf8"),
    readFile(isolatedEvaluatorPath, "utf8"),
    readFile(schedulerPath, "utf8"),
  ]);
const baseline = JSON.parse(baselineRaw);

const routeContractStart = migration.indexOf(
  "create function\n  public.product_experience_baseline_v1_mapping_route",
);
const routeContractEnd = migration.indexOf(
  "revoke all on function\n  public.product_experience_baseline_v1_mapping_route",
);
assert(routeContractStart >= 0 && routeContractEnd > routeContractStart);
const routeContract = migration.slice(routeContractStart, routeContractEnd);
const migrationMappings = new Map(
  [...routeContract.matchAll(/when '([^']+)' then '([^']+)'/gu)].map(
    (match) => [match[1], match[2]],
  ),
);
const baselineMappings = new Map(
  baseline.routeComponentMappings.map((mapping) => [
    mapping.mappingId,
    mapping.route,
  ]),
);

assert.equal(baselineMappings.size, 25);
assert.equal(migrationMappings.size, baselineMappings.size);
assert.deepEqual(
  [...migrationMappings.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ),
  [...baselineMappings.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ),
  "migration route authority must exactly match all immutable Option-C mappings",
);

const familyContractStart = migration.indexOf(
  "create function\n  public.product_experience_baseline_v1_route_family_id",
);
const familyContractEnd = migration.indexOf(
  "revoke all on function\n  public.product_experience_baseline_v1_route_family_id",
);
assert(familyContractStart >= 0 && familyContractEnd > familyContractStart);
const familyContract = migration.slice(familyContractStart, familyContractEnd);
const migrationRouteFamilies = new Map(
  [...familyContract.matchAll(/when '([^']+)' then '([^']+)'/gu)].map(
    (match) => [match[1], match[2]],
  ),
);
const expectedRouteFamilies = new Map(
  [...new Set(baseline.routeComponentMappings.map((mapping) => mapping.route))]
    .map((route) => [
      route,
      `${route.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase()}.main`,
    ]),
);
assert.deepEqual(
  [...migrationRouteFamilies.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ),
  [...expectedRouteFamilies.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  ),
  "route-family identifiers must derive exactly from approved Option-C routes",
);

for (const required of [
  "product_experience_baseline_v1_mapping_contract",
  "product_experience_baseline_v1_evidence_binding_is_valid",
  "product_experience_route_family_binding_hash",
  "product_experience_route_timing_no_finding_is_valid_pre_authoritative_family",
  "product_experience_route_timing_authoritative_family_is_valid",
  "create or replace function public.product_experience_metric_manifest_is_bounded",
  "drop constraint product_experience_sentinel_runs_metric_manifest_check",
  "add constraint product_experience_sentinel_runs_metric_manifest_check",
]) {
  assert(
    migration.includes(required),
    `authoritative migration is missing ${required}`,
  );
}

for (const [label, source, baselineBinding] of [
  ["Edge evaluator", edgeEvaluator, "baselineContractBindingIsValid"],
  ["isolated evaluator", isolatedEvaluator, "baselineBindingIsValid"],
]) {
  assert(source.includes("approvedRouteFamilyId"));
  assert(source.includes("APPROVED_MAPPING_ROUTES"));
  assert(
    source.includes(`!${baselineBinding}(run, metrics)`),
    `${label} must independently reject a caller-chosen mapping`,
  );
  assert(source.includes("route_timing_route_family_binding_required"));
}

assert(
  scheduler.includes("if (!schedule.canaryState.current) return false;") &&
    scheduler.includes(
      "schedule.key === \"weekly_ux_route_dead_control\"",
    ) &&
    scheduler.includes(
      "snapshot.switches.cognitive_installed_journey_sentinel_enabled",
    ) &&
    scheduler.includes(
      "snapshot.switches.cognitive_visual_experience_sentinel_enabled",
    ),
  "weekly UX schedule must remain fail-closed on current evaluated canary evidence",
);

process.stdout.write(
  `route timing authoritative family contract passed (${migrationMappings.size}/${baselineMappings.size} mappings)\n`,
);
