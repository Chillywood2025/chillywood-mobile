#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workflows = fs.readdirSync(path.join(root, ".github/workflows"))
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();
let actionCount = 0;
for (const name of workflows) {
  const source = fs.readFileSync(path.join(root, ".github/workflows", name), "utf8");
  for (const match of source.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+)(?:\s*#\s*(.+))?$/gmu)) {
    actionCount += 1;
    assert.match(match[2], /^[a-f0-9]{40}$/u, `${name}: mutable action reference ${match[1]}@${match[2]}`);
    assert.ok(match[3]?.trim(), `${name}: pinned action ${match[1]} needs a version comment`);
  }
}
assert.ok(actionCount > 0, "no GitHub Actions references found");
process.stdout.write(`cognitive CI supply chain verified (${actionCount} immutable action references)\n`);
