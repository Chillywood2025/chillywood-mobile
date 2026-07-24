#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const registryPath = "config/intelligence/research-authorities.json";
const migrationDirectory = "supabase/migrations";
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const runtime = fs.readFileSync("_lib/cognitivePlatformFoundation.ts", "utf8");

// This ordered manifest is the complete reviewed authority/policy chain. Hashes
// make deployed migrations immutable; generated sections below are derived from
// the canonical registry instead of being independently maintained copies.
const migrationManifest = [
  {
    path: "20260723001845_cognitive_intelligence_foundation.sql",
    sha256: "e4e51a840d3e7e0f77a06dfe5b1f1042bc134f377d534e51f4885da5ecbf14c6",
    authorityIds: [
      "apple-docs",
      "apple-policy",
      "apple-store-policy",
      "apple-security",
      "android-docs",
      "android-policy",
      "android-store-policy",
      "android-security",
      "firebase-docs",
      "firebase-security",
      "expo-docs",
      "expo-security",
      "supabase-docs",
      "supabase-security",
      "github-docs",
      "github-security",
      "revenuecat-docs",
      "revenuecat-security",
      "stripe-docs",
      "stripe-security",
      "livekit-docs",
      "livekit-security",
      "cloudflare-docs",
      "cloudflare-security",
      "iana-docs",
      "reuters-news",
      "ap-news",
    ],
    requiredMarkers: [
      "create table public.cognitive_research_authorities",
      "references public.cognitive_research_authorities",
      "contradiction_state",
    ],
  },
  {
    path: "20260723163359_cognitive_level01_canary_control_plane.sql",
    sha256: "304f1538ab295b7f96ea992000cb0d661fc6bb6f3ef16ca33604c40aec1af154",
    requiredMarkers: [
      "create or replace function public.cognitive_record_research_source",
      "create function public.cognitive_record_public_research_claim",
      "cognitive_public_research_claim_rejected",
    ],
  },
  {
    path: "20260723184340_cognitive_collective_authority_closeout.sql",
    sha256: "0631e2ea59304969734f04d64d67574829a36325d909a2b12404bc043f30f681",
    requiredMarkers: [
      "create function public.cognitive_record_public_research_source",
      "create function public.cognitive_record_public_research_claim_evidence",
      "public_research_claim_provenance_rejected",
    ],
  },
  {
    path: "20260724053000_cognitive_research_authority_extension.sql",
    sha256: "89de4d2f71f8722f3c2f4223103810cbad2d2282f93f30abfcbed3bf7119efa0",
    authorityIds: [
      "chillywood-public-repository",
      "google-play-store-policy",
      "react-native-docs",
    ],
    requiredMarkers: [
      "Closed public research authority registry",
      "retrieved text remains untrusted data",
    ],
  },
  {
    path: "20260724062500_cognitive_public_research_operational_hardening.sql",
    sha256: "0aa8fc06c161443355cfdaf216b03b90279c890f88ad6638a2c7234f4e97a898",
    requiredMarkers: [
      "cognitive_record_public_research_source",
      "public_research_claim_provenance_rejected",
      "claim_contradiction_unresolved",
      "interval '30 days'",
    ],
  },
  {
    path: "20260724072824_cognitive_research_model_review_hardening_after_db.sql",
    sha256: "03f8e6ce81ddb4db38fb2cac1808933e9d9a2aa2121aacb0a4f8da25aeb27a08",
    pathPrefixSection: true,
    requiredMarkers: [
      "cognitive_research_authorities_path_prefix_check",
      "cognitive_enforce_research_authority_path",
      "research_authority_path_rejected",
      "/Chillywood2025/chillywood-mobile",
    ],
  },
  {
    path: "20260724091000_cognitive_research_provenance_contradiction_maintenance.sql",
    sha256: "d0dcc3c46ec6fdc1896de8bac8e11bfcde145e5a2e6ce3b09e32336cfb6971b5",
    requiredMarkers: [
      "cognitive_record_public_research_source_v2",
      "github_commit_metadata",
      "cognitive_research_contradiction_events",
      "caller_contradiction_state_rejected",
    ],
  },
  {
    path: "20260724091500_cognitive_effective_baseline_and_research_v2_enforcement.sql",
    sha256: "f0e51624a64b21c19cb8925b7b7ea2378e570a63bbb8ebc9e821df91aa93a573",
    requiredMarkers: [
      "cognitive_research_require_v2_publication_provenance",
      "research_sources_v2_publication_provenance_required",
      "Superseded public-research source writer",
    ],
  },
  {
    path: "20260724134631_cognitive_level01_isolated_runtime_roles.sql",
    sha256: "9680bce9c566e15cefd58839432267d53253acd263682d945a9148626a3592dc",
    requiredMarkers: [
      "create function cognitive_runtime.record_research_claim_with_readback",
      "to cognitive_public_research_broker",
      "to cognitive_research_evaluator",
    ],
  },
];

const sha256 = (source) =>
  crypto.createHash("sha256").update(source).digest("hex");
const between = (source, begin, end) => {
  const sections = source.split(begin);
  assert.equal(
    sections.length,
    2,
    `expected exactly one ${begin} section`,
  );
  const endings = sections[1].split(end);
  assert.equal(
    endings.length,
    2,
    `expected exactly one ${end} section`,
  );
  return endings[0];
};
const canonicalEntry = (entry) => JSON.stringify({
  authorityId: entry.authorityId,
  hostname: entry.hostname,
  ownerId: entry.ownerId,
  ...(entry.pathPrefix ? { pathPrefix: entry.pathPrefix } : {}),
  publisher: entry.publisher,
  sourceType: entry.sourceType,
});
const sqlEntry = (entry) => JSON.stringify({
  authorityId: entry.authorityId,
  hostname: entry.hostname,
  ownerId: entry.ownerId,
  publisher: entry.publisher,
  sourceType: entry.sourceType,
});
const parseSqlAuthorities = (source) =>
  [...between(
    source,
    "BEGIN GENERATED RESEARCH AUTHORITIES",
    "END GENERATED RESEARCH AUTHORITIES",
  ).matchAll(
    /\('([^']+)','([^']+)','([^']+)','((?:''|[^'])+)','([^']+)'\)/gu,
  )].map((match) => sqlEntry({
    authorityId: match[1],
    hostname: match[2],
    sourceType: match[3],
    publisher: match[4].replaceAll("''", "'"),
    ownerId: match[5],
  }));

assert.equal(registry.schemaVersion, 1);
assert.ok(Array.isArray(registry.authorities));
const canonicalById = new Map();
const canonicalTuples = new Set();
for (const entry of registry.authorities) {
  assert.ok(
    !canonicalById.has(entry.authorityId),
    `duplicate canonical authority id: ${entry.authorityId}`,
  );
  canonicalById.set(entry.authorityId, entry);
  const tuple = canonicalEntry(entry);
  assert.ok(
    !canonicalTuples.has(tuple),
    `duplicate canonical authority tuple: ${entry.authorityId}`,
  );
  canonicalTuples.add(tuple);
}

const manifestPaths = migrationManifest.map((entry) => entry.path);
assert.equal(
  new Set(manifestPaths).size,
  manifestPaths.length,
  "authority migration manifest contains a duplicate path",
);
assert.deepEqual(
  manifestPaths,
  [...manifestPaths].sort(),
  "authority migration manifest is reordered",
);
const migrationFiles = fs.readdirSync(migrationDirectory)
  .filter((file) => /^\d+_.+\.sql$/u.test(file))
  .sort();
const authorityBearingMigrations = migrationFiles.filter((file) => {
  const source = fs.readFileSync(`${migrationDirectory}/${file}`, "utf8");
  return [
    "cognitive_research_authorities",
    "cognitive_record_public_research",
    "cognitive_runtime.record_research",
  ].some((marker) => source.includes(marker));
});
assert.deepEqual(
  authorityBearingMigrations,
  manifestPaths,
  "authority-bearing migration set is missing, stale, duplicated, or reordered",
);
let priorManifestIndex = -1;
const manifestSources = new Map();
for (const entry of migrationManifest) {
  const migrationIndex = migrationFiles.indexOf(entry.path);
  assert.notEqual(
    migrationIndex,
    -1,
    `authority migration missing: ${entry.path}`,
  );
  assert.ok(
    migrationIndex > priorManifestIndex,
    `authority migration reordered: ${entry.path}`,
  );
  priorManifestIndex = migrationIndex;
  const source = fs.readFileSync(`${migrationDirectory}/${entry.path}`, "utf8");
  assert.equal(
    sha256(source),
    entry.sha256,
    `authority migration is stale or rewritten: ${entry.path}`,
  );
  for (const marker of entry.requiredMarkers) {
    assert.ok(
      source.includes(marker),
      `authority migration policy marker missing: ${entry.path}:${marker}`,
    );
  }
  manifestSources.set(entry.path, source);
}

const sqlAuthorityIds = [];
const sqlAuthorityTuples = [];
for (const manifestEntry of migrationManifest.filter(
  (entry) => entry.authorityIds,
)) {
  const source = manifestSources.get(manifestEntry.path);
  const actualEntries = parseSqlAuthorities(source);
  const expectedEntries = manifestEntry.authorityIds.map((authorityId) => {
    const canonical = canonicalById.get(authorityId);
    assert.ok(
      canonical,
      `migration manifest references unknown authority: ${authorityId}`,
    );
    return sqlEntry(canonical);
  });
  assert.deepEqual(
    actualEntries,
    expectedEntries,
    `generated authority section drifted or reordered: ${manifestEntry.path}`,
  );
  sqlAuthorityIds.push(...manifestEntry.authorityIds);
  sqlAuthorityTuples.push(...actualEntries);
}
assert.equal(
  new Set(sqlAuthorityIds).size,
  sqlAuthorityIds.length,
  "migration authority id is duplicated or conflicting",
);
assert.equal(
  new Set(sqlAuthorityTuples).size,
  sqlAuthorityTuples.length,
  "migration authority tuple is duplicated",
);
assert.deepEqual(
  [...sqlAuthorityIds].sort(),
  [...canonicalById.keys()].sort(),
  "ordered migration manifest does not cover the canonical authority registry",
);

const runtimeEntries = [...between(
  runtime,
  "BEGIN GENERATED RESEARCH AUTHORITIES",
  "END GENERATED RESEARCH AUTHORITIES",
).matchAll(
  /\{\s*authorityId:\s*"([^"]+)",\s*hostname:\s*"([^"]+)",\s*ownerId:\s*"([^"]+)",\s*(?:pathPrefix:\s*"([^"]+)",\s*)?publisher:\s*"([^"]+)",\s*sourceType:\s*"([^"]+)"\s*\}/gu,
)].map((match) => canonicalEntry({
  authorityId: match[1],
  hostname: match[2],
  ownerId: match[3],
  ...(match[4] ? { pathPrefix: match[4] } : {}),
  publisher: match[5],
  sourceType: match[6],
}));
assert.deepEqual(
  runtimeEntries,
  registry.authorities.map(canonicalEntry),
  "runtime authority registry drifted or reordered from canonical JSON",
);

const pathMigration = migrationManifest.find(
  (entry) => entry.pathPrefixSection,
);
assert.ok(pathMigration, "path-prefix migration missing from manifest");
const pathEntries = [...between(
  manifestSources.get(pathMigration.path),
  "BEGIN GENERATED RESEARCH AUTHORITY PATHS",
  "END GENERATED RESEARCH AUTHORITY PATHS",
).matchAll(/\('([^']+)','([^']+)'\)/gu)]
  .map((match) => [match[1], match[2]]);
const expectedPathEntries = registry.authorities
  .filter((entry) => entry.pathPrefix)
  .map((entry) => [entry.authorityId, entry.pathPrefix]);
assert.deepEqual(
  pathEntries,
  expectedPathEntries,
  "generated authority path section drifted or reordered from canonical JSON",
);
assert.deepEqual(
  canonicalById.get("chillywood-public-repository"),
  {
    authorityId: "chillywood-public-repository",
    hostname: "github.com",
    ownerId: "chillywood",
    pathPrefix: "/Chillywood2025/chillywood-mobile",
    publisher: "Chi'llywood",
    sourceType: "engineering_practice",
  },
  "Chi'llywood public repository authority scope widened or drifted",
);

process.stdout.write(
  `cognitive research authorities ${registry.authorities.length}/${registry.authorities.length} match across ${migrationManifest.length} ordered migrations\n`,
);
