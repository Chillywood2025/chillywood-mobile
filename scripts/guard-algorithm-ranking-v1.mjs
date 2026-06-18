#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

const fail = (message) => {
  console.error(`Algorithm Ranking V1 guard failed: ${message}`);
  process.exitCode = 1;
};

const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const moduleSource = read("_lib/algorithmRanking.ts");
const featureFlags = read("_lib/featureFlags.ts");
const packageJson = read("package.json");
const home = read("app/(tabs)/index.tsx");
const live = read("app/(tabs)/live.tsx");
const publicPlatform = read("app/channel/[userId].tsx");
const docs = read("docs/ALGORITHM_FOUNDATION_V1.md");

[
  "scoreVideoForHome",
  "scoreCreatorPlatform",
  "scoreLiveDiscoveryItem",
  "scorePaidCreatorOffer",
  "scoreSearchResult",
  "explainScore",
  "DEFAULT_ALGORITHM_RANKING_WEIGHTS",
  "algorithmRankingV1Enabled = false",
].forEach((needle) => assertIncludes(moduleSource, needle, "_lib/algorithmRanking.ts"));

assertIncludes(featureFlags, "algorithm_ranking_v1_enabled", "Remote Config defaults");
assertIncludes(docs, "rules-based", "Algorithm doctrine");
assertIncludes(docs, "No paid recommendation vendor", "Algorithm doctrine");

[
  "algolia",
  "recombee",
  "constructorio",
  "constructor.io",
  "amazon-personalize",
  "personalize-runtime",
  "pinecone",
  "weaviate",
  "qdrant",
  "milvus",
  "openai",
  "cohere",
  "vertexai",
].forEach((needle) => assertNotIncludes(packageJson.toLowerCase(), needle, "package.json external recommendation/ML dependency"));

assertNotIncludes(home, "scoreVideoForHome(", "Home production feed");
assertNotIncludes(home, "algorithmRankingV1Enabled", "Home production feed");
assertNotIncludes(live, "scoreLiveDiscoveryItem(", "Live tab production feed");
assertNotIncludes(publicPlatform, "scoreCreatorPlatform(", "Public Platform production feed");

const compiledPath = path.join(os.tmpdir(), "chillywood-algorithmRanking-guard.cjs");
const compiled = ts.transpileModule(moduleSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
writeFileSync(compiledPath, compiled.outputText);
const ranking = require(compiledPath);

const weights = ranking.resolveAlgorithmRankingWeights({
  freshnessWeight: 99,
  engagementWeight: -1,
  safetyPenaltyWeight: "bad",
});
for (const [key, value] of Object.entries(weights)) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`weight ${key} is not bounded: ${value}`);
  }
}

const safe = ranking.scoreVideoForHome({
  id: "safe",
  visibility: "public",
  moderationStatus: "clean",
  publishedAt: "2026-06-18T08:00:00.000Z",
  likeCount: 20,
  viewCount: 100,
  completionRate: 0.7,
}, null, Date.parse("2026-06-18T12:00:00.000Z"));

const reported = ranking.scoreVideoForHome({
  id: "reported",
  visibility: "public",
  moderationStatus: "reported",
  reportCount: 4,
  publishedAt: "2026-06-18T08:00:00.000Z",
  likeCount: 100,
  viewCount: 100,
  completionRate: 0.9,
}, null, Date.parse("2026-06-18T12:00:00.000Z"));

const privateItem = ranking.scoreVideoForHome({
  id: "private",
  visibility: "private",
  moderationStatus: "clean",
  isPrivate: true,
}, null, Date.parse("2026-06-18T12:00:00.000Z"));

const subscriberOnly = ranking.scoreVideoForHome({
  id: "subscriber-only",
  visibility: "public",
  moderationStatus: "clean",
  isSubscriberOnly: true,
  viewerHasAccess: false,
}, null, Date.parse("2026-06-18T12:00:00.000Z"));

if (safe.finalScore <= 0) fail("safe public content should produce a positive score");
if (reported.finalScore >= safe.finalScore) fail("reported content must rank below comparable safe content");
if (!privateItem.excluded || privateItem.finalScore !== 0) fail("private content must be excluded from public ranking");
if (!subscriberOnly.excluded || subscriberOnly.finalScore !== 0) {
  fail("subscriber-only content must be excluded when viewer is unauthorized");
}
if (!safe.explanation.length || !reported.explanation.length) fail("score explanations must be generated");

if (process.exitCode) process.exit();
console.log("Algorithm Ranking V1 guard passed.");
