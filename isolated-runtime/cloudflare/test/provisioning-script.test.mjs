import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL(
  "../../../scripts/provision-cognitive-level01-runtime-logins.sh",
  import.meta.url,
);
const scriptPath = fileURLToPath(scriptUrl);

test("runtime login provisioner remains Bash 3.2 compatible and fail-closed", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.doesNotMatch(source, /\bdeclare\s+-A\b/u);
  assert.match(source, /observed_passwords=\(\)/u);
  assert.match(
    source,
    /revoke create, temporary on database %I from %I/u,
  );
  assert.match(source, /with admin false/u);
  assert.match(source, /with inherit true/u);
  assert.match(source, /with set false/u);

  const result = spawnSync("/bin/bash", [scriptPath, "provision"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      PGSERVICE: "not-used",
    },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "MISSING");
});
