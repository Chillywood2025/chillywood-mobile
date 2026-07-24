#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const registry = JSON.parse(fs.readFileSync("config/intelligence/research-authorities.json", "utf8"));
const runtime = fs.readFileSync("_lib/cognitivePlatformFoundation.ts", "utf8");
const migration = fs.readFileSync(
  "supabase/migrations/20260723001845_cognitive_intelligence_foundation.sql",
  "utf8",
);
const extensionMigration = fs.readFileSync(
  "supabase/migrations/20260724053000_cognitive_research_authority_extension.sql",
  "utf8",
);
const between = (source) => source.split("BEGIN GENERATED RESEARCH AUTHORITIES")[1]
  ?.split("END GENERATED RESEARCH AUTHORITIES")[0] ?? "";
const canonical = registry.authorities.map((entry) => JSON.stringify(entry)).sort();
const runtimeEntries = [...between(runtime).matchAll(
  /\{\s*authorityId:\s*"([^"]+)",\s*hostname:\s*"([^"]+)",\s*ownerId:\s*"([^"]+)",\s*publisher:\s*"([^"]+)",\s*sourceType:\s*"([^"]+)"\s*\}/gu,
)].map((match) => JSON.stringify({
  authorityId: match[1],
  hostname: match[2],
  ownerId: match[3],
  publisher: match[4],
  sourceType: match[5],
})).sort();
const sqlEntries = [...`${between(migration)}\n${between(extensionMigration)}`.matchAll(
  /\('([^']+)','([^']+)','([^']+)','((?:''|[^'])+)','([^']+)'\)/gu,
)].map((match) => JSON.stringify({
  authorityId: match[1],
  hostname: match[2],
  ownerId: match[5],
  publisher: match[4].replaceAll("''", "'"),
  sourceType: match[3],
})).sort();

assert.equal(registry.schemaVersion, 1);
assert.equal(new Set(canonical).size, canonical.length, "canonical research authorities must be unique");
assert.deepEqual(runtimeEntries, canonical, "runtime authority registry drifted from the canonical JSON");
assert.deepEqual(sqlEntries, canonical, "migration authority registry drifted from the canonical JSON");
process.stdout.write(`cognitive research authorities ${canonical.length}/${canonical.length} match\n`);
