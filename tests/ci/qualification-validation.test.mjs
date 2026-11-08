import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { computeValidationPlan, expectedJobs } from "../../scripts/ci/required-validation.mjs";

const policy = JSON.parse(fs.readFileSync(new URL("../../config/ci/required-validation-v1.json", import.meta.url), "utf8"));
test("standalone qualification edits select actual native and database validation without relying on unknown paths", () => {
  for (const suffix of ["App.js", "config.js", "native.js", "plugins/withQualification.js", "README.md",
    "modules/qualification-native/ios/ChillywoodQualificationModule.swift",
    "modules/qualification-native/android/src/main/java/expo/modules/chillywoodqualification/QualificationPolicy.java",
    "tests/client.test.mjs"]) {
    const file = "qualification/test-store-debug/" + suffix;
    const plan = computeValidationPlan([file]);
    assert.deepEqual(plan.unknown, []);
    for (const category of ["product", "sensitive", "database", "nativeRelease"]) assert.equal(plan.categories[category], true, file + ":" + category);
    const jobs = expectedJobs(plan);
    for (const job of ["Validation / Native and Release", "Validation / Isolated Sandbox Native PostgreSQL 17.6"]) assert(jobs.includes(job));
    for (const category of ["database", "nativeRelease"]) {
      const previous = structuredClone(policy);
      previous.categories[category] = previous.categories[category].filter(pattern => pattern !== "qualification/test-store-debug/**");
      const missing = computeValidationPlan([file], previous);
      assert.deepEqual(missing.unknown, []);
      assert.equal(missing.categories[category], false, "Former classification must fail this required lane: " + file);
    }
  }
});

test("standalone lockfile changes retain explicit policy review and all required lanes", () => {
  for (const suffix of ["package.json", "package-lock.json"]) {
    const plan = computeValidationPlan(["qualification/test-store-debug/" + suffix]);
    assert.equal(plan.categories.policy, true);
    assert.equal(plan.conservative, true);
    assert(expectedJobs(plan).includes("Validation / Policy"));
  }
});

test("v2 native contract and compile-test edits select native compilation", () => {
  for (const file of ["tests/isolated-test-store-v2-native.test.mjs", "tests/isolated-test-store-v2-native-compile.test.mjs"]) {
    const plan = computeValidationPlan([file]);
    assert.deepEqual(plan.unknown, []);
    assert.equal(plan.categories.database, true);
    assert.equal(plan.categories.nativeRelease, true);
  }
});
