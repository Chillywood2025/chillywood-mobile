#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourcePath = path.join(root, "_lib/algorithmRanking.ts");
const compiledPath = path.join(os.tmpdir(), "chillywood-algorithmRanking.cjs");

const source = readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
writeFileSync(compiledPath, compiled.outputText);

const ranking = require(compiledPath);
const now = new Date("2026-06-18T12:00:00.000Z").getTime();

const fixtures = [
  {
    id: "safe-fresh-video",
    surface: "home_video",
    title: "Fresh public upload",
    creatorId: "creator-new",
    visibility: "public",
    moderationStatus: "clean",
    publishedAt: "2026-06-18T08:00:00.000Z",
    likeCount: 42,
    favoriteCount: 16,
    commentCount: 9,
    shareCount: 4,
    viewCount: 500,
    completionRate: 0.71,
    creatorAccountAgeDays: 21,
    creatorFollowerCount: 18,
  },
  {
    id: "active-live-room",
    surface: "live_discovery",
    title: "Active Live Watch-Party",
    creatorId: "creator-live",
    visibility: "public",
    moderationStatus: "clean",
    startsAt: "2026-06-18T11:50:00.000Z",
    isLive: true,
    isActive: true,
    likeCount: 12,
    commentCount: 32,
    shareCount: 5,
    watchCount: 240,
    completionRate: 0.58,
    creatorTrustScore: 0.86,
  },
  {
    id: "already-seen-repeat",
    surface: "home_video",
    title: "Watched public upload",
    creatorId: "creator-repeat",
    visibility: "public",
    moderationStatus: "clean",
    publishedAt: "2026-06-17T12:00:00.000Z",
    likeCount: 88,
    commentCount: 18,
    shareCount: 7,
    viewCount: 900,
    completionRate: 0.8,
    alreadySeen: true,
    watchedCompletionRate: 0.96,
    sameCreatorRecentCount: 5,
  },
  {
    id: "reported-video",
    surface: "home_video",
    title: "Reported public upload",
    creatorId: "creator-review",
    visibility: "public",
    moderationStatus: "reported",
    reportCount: 3,
    publishedAt: "2026-06-18T09:00:00.000Z",
    likeCount: 100,
    commentCount: 30,
    shareCount: 15,
    viewCount: 300,
    completionRate: 0.9,
  },
  {
    id: "private-draft",
    surface: "home_video",
    title: "Private draft should not rank",
    creatorId: "creator-private",
    visibility: "draft",
    moderationStatus: "clean",
    isDraft: true,
    publishedAt: "2026-06-18T10:00:00.000Z",
  },
  {
    id: "paid-offer-safe",
    surface: "paid_creator_offer",
    title: "Creator VIP offer",
    creatorId: "creator-offer",
    visibility: "public",
    moderationStatus: "clean",
    isPaid: true,
    paidOfferScope: "creator_vip",
    publishedAt: "2026-06-16T12:00:00.000Z",
    likeCount: 24,
    favoriteCount: 6,
    commentCount: 4,
    shareCount: 2,
    viewCount: 160,
    creatorTrustScore: 0.74,
  },
  {
    id: "search-match-safe",
    surface: "search_result",
    title: "Chicago street premiere",
    searchText: "Rachi Originals public event Chicago",
    query: "chicago premiere",
    visibility: "public",
    moderationStatus: "clean",
    publishedAt: "2026-06-15T12:00:00.000Z",
    likeCount: 18,
    commentCount: 6,
    shareCount: 3,
    viewCount: 120,
  },
];

const scoreBySurface = (fixture) => {
  switch (fixture.surface) {
    case "creator_platform":
      return ranking.scoreCreatorPlatform(fixture, null, now);
    case "live_discovery":
      return ranking.scoreLiveDiscoveryItem(fixture, null, now);
    case "paid_creator_offer":
      return ranking.scorePaidCreatorOffer(fixture, null, now);
    case "search_result":
      return ranking.scoreSearchResult(fixture, null, now);
    default:
      return ranking.scoreVideoForHome(fixture, null, now);
  }
};

const results = fixtures
  .map((fixture) => ({
    id: fixture.id,
    surface: fixture.surface,
    ...scoreBySurface(fixture),
  }))
  .sort((left, right) => right.finalScore - left.finalScore);

const output = {
  generatedAt: new Date().toISOString(),
  dryRunOnly: true,
  mutatedProductionData: false,
  usedPrivateViewerData: false,
  version: ranking.ALGORITHM_RANKING_V1_VERSION,
  results,
};

const artifactsDir = path.join(root, "artifacts");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
const outputPath = path.join(artifactsDir, "algorithm-ranking-dry-run.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

for (const result of results) {
  console.log(`${result.surface} ${result.id} score=${result.finalScore} excluded=${result.excluded}`);
  console.log(`  ${result.explanation.join(" ")}`);
}
console.log(`Dry-run output: ${outputPath}`);
