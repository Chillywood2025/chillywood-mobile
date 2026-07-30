#!/usr/bin/env node
import fs from "node:fs";
import { args, emit, git, readJson } from "./lib.mjs";

const options = args();
const policy = readJson("config/assurance/pr-scope-policy-v1.json");
const impact = readJson("config/assurance/test-impact-map-v1.json");
const files = options.paths
  ? fs.readFileSync(options.paths, "utf8").split(/\r?\n/gu).filter(Boolean)
  : options.head
    ? git(["diff", "--name-only", `${options.base ?? "origin/main"}...${options.head}`]).split(/\r?\n/gu).filter(Boolean)
    : git(["diff", "--name-only", options.base ?? "origin/main"]).split(/\r?\n/gu).filter(Boolean);
const isInstruction = (file) => /(^|\/)AGENTS\.md$/u.test(file) || ["CURRENT_STATE.md", "NEXT_TASK.md"].includes(file);
const documentationGates = ["assurance-contracts", "assurance-current-truth", "assurance-pr-scope", "assurance-review-head", "links", "git-diff", "assurance-final-summary"];
const domains = [...new Set(files.flatMap((file) => isInstruction(file) ? ["documentation-metadata"] : policy.domains.filter(({ paths }) => paths.some((prefix) => file === prefix || file.startsWith(prefix) || (prefix.startsWith("*") && file.endsWith(prefix.slice(1))))).map(({ id }) => id)))].sort();
const gates = [...new Set(files.flatMap((file) => isInstruction(file) ? documentationGates : impact.pathRules.filter(({ match }) => match.some((prefix) => prefix.startsWith("*") ? file.endsWith(prefix.slice(1)) : file === prefix || file.startsWith(prefix))).flatMap((rule) => rule.gates)))].sort();
const feature = options.feature ? readJson("config/assurance/feature-registry-v1.json").features.find(({ featureId }) => featureId === options.feature) : null;
const missingFeature = options.feature && !feature;
emit("assurance:impact", !missingFeature, {
  base: options.base ?? "origin/main", head: options.head ?? "HEAD", files, domains, requiredGates: gates,
  featureId: feature?.featureId ?? null,
  findings: missingFeature ? [{ id: "ASSURANCE_FEATURE_NOT_REGISTERED", status: "BLOCKED_INTERNAL" }] : []
}, [`assurance impact: ${missingFeature ? "FAIL" : "PASS"} — ${files.length} files, ${domains.length} domains, ${gates.length} gates`]);
