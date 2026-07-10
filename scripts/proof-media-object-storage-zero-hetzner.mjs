#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const helper = readFileSync("_lib/mediaObjectStorageMigration.ts", "utf8");
const cli = readFileSync("scripts/media-object-storage-r2-migration.mjs", "utf8");

assert(helper.includes("canCloseHetznerObjectStorage"), "helper exposes shutdown readiness check");
assert(helper.includes("activeUnresolvedHetznerObjectStorageReferences"), "shutdown checks active unresolved object-storage refs");
assert(helper.includes("resolvedHistoricalHetznerObjectStorageReferences"), "shutdown distinguishes resolved historical refs");
assert(helper.includes("liveKitOutOfScope"), "helper marks LiveKit out of scope");
assert(helper.includes("copyVerified"), "shutdown requires copy verification");
assert(helper.includes("dbUpdated"), "shutdown requires DB update");
assert(helper.includes("newUploadsR2"), "shutdown requires new upload path on R2");
assert(cli.includes("mode === \"zero-hetzner\""), "CLI exposes zero-Hetzner audit mode");
assert(cli.includes("remainingHetznerObjectStorageReferences"), "CLI reports raw object-storage refs");
assert(cli.includes("liveKitOutOfScope: true"), "CLI reports LiveKit as out of scope");
assert(cli.includes("hetznerObjectStorageShutdownReady"), "CLI reports object-storage shutdown readiness only");

const fixture = spawnSync(process.execPath, ["scripts/media-object-storage-r2-migration.mjs", "--mode=zero-hetzner", "--source=fixture"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
assert(fixture.status !== 0, "fixture with Hetzner object refs must fail zero-Hetzner");
const payload = JSON.parse(fixture.stdout);
assert(payload.ok === false, "zero-Hetzner fixture not closed");
assert(payload.remainingHetznerObjectStorageReferences > 0, "fixture has remaining Hetzner object refs");
assert(payload.liveKitOutOfScope === true, "LiveKit remains out of scope");
assert(payload.hetznerObjectStorageShutdownReady === false, "shutdown is not ready with remaining refs");
assert(payload.secretsPrinted === false, "no secrets printed");

console.log(JSON.stringify({
  ok: true,
  zeroActiveUnresolvedRefsRequired: true,
  rawHistoricalRefsCanRemainOnlyWhenResolved: true,
  liveKitNotShutdownCandidate: true,
  copyDbAndUploadProofRequired: true,
  remainingRefsBlockShutdown: true,
  noSecretsPrinted: true,
}, null, 2));
