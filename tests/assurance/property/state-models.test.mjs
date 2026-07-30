import assert from "node:assert/strict";
import test from "node:test";
import { modelDefinitions } from "../../../_lib/assurance/state-models/models.mjs";
import { runPropertyModels } from "../../../_lib/assurance/state-models/properties.mjs";

for (const [domain, definition] of Object.entries(modelDefinitions)) {
  test(`${domain} preserves its invariants with replayable deterministic commands`, () => {
    const report = runPropertyModels({ domains: [domain], numRuns: 200, maxCommands: 24 });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.propertyCases, 200);
    assert.equal(report.results[0].seed, definition.seed);
    assert.equal(report.results[0].status, "MODEL_CLEAR");
    assert.match(report.results[0].replayPath, new RegExp(`--domain=${domain} --seed=${definition.seed}`));
    assert.deepEqual(report.results[0].minimizedCommandSequence, []);
  });
}
