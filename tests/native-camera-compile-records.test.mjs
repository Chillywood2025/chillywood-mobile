import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseGradleRecord, verifyRuntimeAars } from "../scripts/compile-native-camera-effects.mjs";

test("Gradle closure records must be present, singular and valid JSON", () => {
  const artifacts = [{ coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: "/cache/litert.aar" }];
  const record = `CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=${JSON.stringify(artifacts)}\r\n`;
  assert.deepEqual(parseGradleRecord(`Gradle progress\n${record}BUILD SUCCESSFUL\n`, "RUNTIME_ARTIFACTS"), artifacts);
  for (const output of ["BUILD SUCCESSFUL", record + record, "CHILLYWOOD_CAMERA_RUNTIME_ARTIFACTS=not-json\n"]) {
    assert.throws(() => parseGradleRecord(output, "RUNTIME_ARTIFACTS"));
  }
  assert.throws(() => parseGradleRecord(record, "MERGED_MANIFESTS"));
});

test("resolved runtime byte guard rejects missing, duplicate, version-shifted or transformed LiteRT", () => {
  const runtime = { coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: "/cache/litert.aar" };
  const api = { coordinate: "com.google.ai.edge.litert:litert-api:1.4.1", type: "aar", file: "/cache/litert-api.aar" };
  assert.throws(() => verifyRuntimeAars([]), /must not be empty/u);
  assert.throws(() => verifyRuntimeAars([api]), /Exactly one resolved litert/u);
  assert.throws(() => verifyRuntimeAars([runtime, runtime, api]), /Exactly one resolved litert/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, coordinate: "com.google.ai.edge.litert:litert:1.4.2" }, api]), /version must match/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, type: "jar" }, api]), /original AAR bytes/u);
  assert.throws(() => verifyRuntimeAars([{ ...runtime, file: "relative/litert.aar" }, api]), /must be absolute/u);
});

test("an AAR at the expected coordinate still fails when its actual bytes changed", () => {
  const directory = path.resolve("artifacts/native-camera-compile-unit-fixtures");
  fs.mkdirSync(directory, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(directory, "run-"));
  const filename = path.join(fixture, "litert.aar");
  try {
    fs.writeFileSync(filename, "corrupt runtime bytes");
    assert.throws(() => verifyRuntimeAars([
      { coordinate: "com.google.ai.edge.litert:litert:1.4.1", type: "aar", file: filename },
      { coordinate: "com.google.ai.edge.litert:litert-api:1.4.1", type: "aar", file: path.join(fixture, "litert-api.aar") },
    ]), /AAR bytes differ/u);
  } finally {
    // Only this test's corrupt fixture is removed; generated native sources and
    // validation receipts are retained by the actual compile runner.
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
