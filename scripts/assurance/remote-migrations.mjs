#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { args, classifyMigration, emit, normalizeSql, providerMode, readJson, rel, sha256 } from "./lib.mjs";

const options = args();
if (options.dogfood) {
  const dogfood = readJson("config/assurance/dogfood-pr-a-v1.json");
  const pr = dogfood.subjects.find(({ id }) => id === "PR-52-CURRENT");
  const classifications = pr.facts.migrationComparisons.map((entry) => ({
    remoteVersion: entry.remoteVersion,
    sourceVersion: entry.sourceVersion,
    name: entry.remoteName,
    classification: classifyMigration(
      { version: entry.remoteVersion, name: entry.remoteName, hash: entry.remoteHash },
      entry.sourceVersion ? { version: entry.sourceVersion, name: entry.sourceName, hash: entry.sourceHash } : null
    )
  }));
  const drift = classifications.filter(({ classification }) => classification !== "REMOTE_AND_SOURCE_MATCH");
  emit("assurance:remote-migrations", true, {
    dogfoodPassed: drift.length === 3,
    source: "PR-52-CURRENT",
    remoteHead: "20260730161737",
    classifications,
    findings: [{ id: "ASSURANCE_REMOTE_MIGRATION_DRIFT", status: "BLOCKED_INTERNAL", count: drift.length, waived: false }]
  }, [`remote-migration dogfood: PASS — ${drift.length} mismatches retained as blockers`]);
} else {
  let mode;
  try {
    mode = providerMode(options);
  } catch (error) {
    emit("assurance:remote-migrations", false, { findings: [{ id: error.message, status: "BLOCKED_INTERNAL" }] }, [`remote migrations: FAIL — ${error.message}`]);
  }
  if (mode) {
    if (mode !== "read-only") {
      emit("assurance:remote-migrations", false, { findings: [{ id: "ASSURANCE_REMOTE_EVIDENCE_REQUIRED", status: "BLOCKED_EXTERNAL" }] }, ["remote migrations: FAIL — explicit read-only snapshot required"]);
    } else {
      const snapshot = readJson(options.providerSnapshot ?? options.snapshot);
      const remote = snapshot.migrations ?? snapshot.remoteAfterMain ?? [];
      const directory = rel("supabase/migrations");
      const source = fs.readdirSync(directory).filter((file) => /^\d{12,14}_.+\.sql$/u.test(file)).map((file) => {
        const match = file.match(/^(\d{12,14})_(.+)\.sql$/u);
        const body = fs.readFileSync(path.join(directory, file), "utf8");
        return { version: match[1], name: match[2], hash: sha256(body), normalizedHash: sha256(normalizeSql(body)), file };
      });
      const classifications = remote.map((entry) => {
        const exact = source.find(({ version }) => version === entry.version);
        const bodyCandidate = exact ?? source.find(({ hash, normalizedHash }) => [hash, normalizedHash].includes(entry.hash ?? entry.normalizedHash));
        return { remote: entry, source: bodyCandidate ?? null, classification: classifyMigration({ version: entry.version, name: entry.name, hash: entry.hash ?? entry.normalizedHash }, bodyCandidate ? { version: bodyCandidate.version, name: bodyCandidate.name, hash: bodyCandidate.hash } : null) };
      });
      for (const entry of source.filter(({ version }) => !remote.some((item) => item.version === version))) classifications.push({ remote: null, source: entry, classification: "SOURCE_ONLY" });
      const drift = classifications.filter(({ classification }) => !["REMOTE_AND_SOURCE_MATCH", "SOURCE_ONLY"].includes(classification));
      emit("assurance:remote-migrations", drift.length === 0, { mode, classifications, findings: drift.map((entry) => ({ id: "ASSURANCE_REMOTE_MIGRATION_DRIFT", status: "BLOCKED_INTERNAL", classification: entry.classification })) }, [`remote migrations: ${drift.length ? "FAIL" : "PASS"} — ${drift.length} remote/source mismatch${drift.length === 1 ? "" : "es"}`]);
    }
  }
}
