import assert from "node:assert/strict";
import test from "node:test";

import { validateAuditResult } from "../scripts/guard-cognitive-dependency-advisories.mjs";

function reportWith(counts = {}) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...counts };
  vulnerabilities.total = Object.values(vulnerabilities).reduce((sum, count) => sum + count, 0);
  return { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities } };
}

function auditResult(report = reportWith(), overrides = {}) {
  return { error: undefined, signal: null, status: 0, stdout: JSON.stringify(report), ...overrides };
}

test("a complete clean audit report passes both scopes", () => {
  for (const scope of ["all", "production"]) {
    assert.deepEqual(validateAuditResult(auditResult(), "fixture", scope), reportWith().metadata.vulnerabilities);
  }
});

test("npm error reports cannot be counted as a clean audit", () => {
  for (const report of [
    { error: { code: "ENOAUDIT", summary: "Audit endpoint unavailable" } },
    { ...reportWith(), error: { code: "ENOTFOUND" } },
  ]) {
    assert.throws(() => validateAuditResult(auditResult(report, { status: 1 }), "fixture", "production"), /npm error report/);
  }
});

test("missing, partial, and invalid audit reports fail closed", () => {
  for (const report of [null, [], {}, { vulnerabilities: {} }, { ...reportWith(), vulnerabilities: [] },
    { ...reportWith(), metadata: { vulnerabilities: {} } }]) {
    assert.throws(() => validateAuditResult(auditResult(report), "fixture", "production"));
  }
  for (const stdout of ["", "   ", "not JSON"]) {
    assert.throws(() => validateAuditResult(auditResult(undefined, { stdout }), "fixture", "production"), /no report|invalid JSON/);
  }
});

test("vulnerability totals must contain consistent nonnegative integer counts", () => {
  for (const count of [undefined, null, "0", -1, 0.5]) {
    const report = reportWith();
    report.metadata.vulnerabilities.high = count;
    assert.throws(() => validateAuditResult(auditResult(report), "fixture", "production"), /invalid high totals/);
  }
  const report = reportWith();
  report.metadata.vulnerabilities.total = 1;
  assert.throws(() => validateAuditResult(auditResult(report), "fixture", "production"), /inconsistent totals/);
});

test("process failure cannot pass even when stdout resembles a clean audit", () => {
  for (const overrides of [{ error: new Error("spawn failed") }, { signal: "SIGTERM", status: null },
    { status: null }, { status: 2 }, { status: 1 }]) {
    assert.throws(() => validateAuditResult(auditResult(undefined, overrides), "fixture", "production"));
  }
});

test("genuine production high and critical advisories block without changing full audit reporting", () => {
  for (const severity of ["high", "critical"]) {
    const result = auditResult(reportWith({ [severity]: 1 }), { status: 1 });
    assert.throws(() => validateAuditResult(result, "fixture", "production"), new RegExp(`production ${severity} advisory`));
    assert.equal(validateAuditResult(result, "fixture", "all")[severity], 1);
  }
});

test("production moderate findings retain their existing reviewed threshold", () => {
  const result = auditResult(reportWith({ moderate: 3 }), { status: 1 });
  assert.equal(validateAuditResult(result, "fixture", "production").moderate, 3);
});

test("an unrecognized scope cannot skip production enforcement", () => {
  assert.throws(() => validateAuditResult(auditResult(), "fixture", "other"), /invalid scope/);
});
