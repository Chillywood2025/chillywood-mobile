import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../",import.meta.url));
for (const script of [
  "scripts/test-live-room-authority-postgres.mjs",
  "scripts/test-livekit-monitor-publish-authority.mjs",
]) {
  test(script,{timeout:120_000},() => {
    execFileSync(process.execPath,[script],{cwd,timeout:110_000,stdio:"pipe"});
  });
}
