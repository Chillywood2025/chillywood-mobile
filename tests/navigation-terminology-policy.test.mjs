import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const guard = path.join(root, "scripts/guard-navigation-terminology-policy.mjs");
const inputs = [...fs.readFileSync(guard, "utf8").matchAll(/\bread\("([^"]+)"\)/g)].map(match => match[1]);

function runGuard(t, mutation) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "chilly-navigation-policy-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const relative of inputs) {
    const destination = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  if (mutation) {
    const [file, before, after] = mutation;
    const target = path.join(fixture, file);
    const source = fs.readFileSync(target, "utf8");
    assert.ok(source.includes(before), "negative control must mutate actual source");
    fs.writeFileSync(target, source.replace(before, after));
  }
  return spawnSync(process.execPath, [guard], { cwd: fixture, encoding: "utf8" });
}

test("navigation policy accepts current backed surfaces and static cancellation errors", t => {
  const result = runGuard(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

const controls = [
  ["Library progress read", "app/(tabs)/my-list.tsx", "readWatchProgressState(", "readUnbackedProgress(", "Library backed continue watching"],
  ["Library progress consumption", "app/(tabs)/my-list.tsx", "const progressMap = progressState?.progress ?? null", "const progressMap = null", "Library reads backed progress state"],
  ["Explore feed hook", "app/(tabs)/explore.tsx", 'useLiveDiscoveryFeed({ surface: "home", limit: 36 })', 'useUnbackedFeed({ surface: "home", limit: 36 })', "Explore ranked public discovery feed source"],
  ["Explore public reader", "_lib/useLiveDiscoveryFeed.ts", "readPublicDiscoveryFeedItems({ ...settings, signal: sharedSignal })", "Promise.resolve([])", "Explore backing public discovery read"],
  ["Explore ranking", "_lib/useLiveDiscoveryFeed.ts", "rankDiscoveryFeedItems(publicRows, signals)", "publicRows", "Explore backed public discovery ranking"],
  ["rendered host guidance", "app/watch-party/index.tsx", "{hostGuideRows.map((row) => (", "{[].map((row) => (", "Watch-Party rendered host guidance"],
  ["Circle provider rejection", "_lib/friendGraph.ts", 'throw new UserFacingError("circle_action", "Chi\'lly Circle could not load right now.");', "throw failure.reason;", "approved, static customer-safe errors"],
  ["Circle retired message mutation", "_lib/friendGraph.ts", 'error.name = "AbortError";', 'error.name = "AbortError"; error.message = provider.message;', "approved, static customer-safe errors"],
  ["Circle escaped error mutation", "_lib/friendGraph.ts", 'error.name = "AbortError";', 'error.name = "AbortError"; change(error);', "approved, static customer-safe errors"],
];
for (const [name, file, before, after, diagnostic] of controls) {
  test(`navigation policy rejects ${name} regression`, t => {
    const result = runGuard(t, [file, before, after]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(diagnostic), result.stderr);
  });
}
