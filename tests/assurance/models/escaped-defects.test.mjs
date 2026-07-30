import assert from "node:assert/strict";
import test from "node:test";
import { runEscapedDefectChecks } from "../../../_lib/assurance/state-models/properties.mjs";

test("historical variants reproduce escaped defects while the fixed contract model rejects them", () => {
  const report = runEscapedDefectChecks();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.fixtureCount, 10);
  for (const result of report.results) {
    assert.equal(result.historicalDetected, true, `${result.defectId} historical variant was not detected`);
    assert.equal(result.currentModelPass, true, `${result.defectId} escaped the fixed contract model`);
    assert.deepEqual(result.currentViolations, []);
  }
});
