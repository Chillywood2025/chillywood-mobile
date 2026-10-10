import assert from "node:assert/strict";
import test from "node:test";
import { reportBoundedNativeCallError } from "../_lib/nativeCallErrorDiagnostics.mjs";

for (const phase of ["capture", "request_answer", "complete_answer"]) {
  test(`native ${phase} preserves useful bounded fields without arbitrary error or context text`, () => {
    const privateMarker = "PRIVATE-CALL-UUID-TOKEN-URL-DESCRIPTION";
    const error = Object.assign(new Error(privateMarker), {
      name: "NotReadableError", domain: "AVFoundationErrorDomain", code: -11819,
      stack: privateMarker, details: privateMarker, userInfo: { secret: privateMarker },
    });
    const reports = [];
    reportBoundedNativeCallError((scope, error, metadata) => reports.push({ scope, error, metadata }), phase, error, {
      audio: true, video: false, connected: false, facingMode: "environment", appState: "background",
      callUuid: privateMarker, inviteId: privateMarker, participantToken: privateMarker, arbitrary: privateMarker,
    });
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0].metadata, {
      phase, nativeErrorName: "NotReadableError", nativeErrorDomain: "AVFoundationErrorDomain", nativeErrorCode: -11819,
      audio: true, video: false, connected: false, facingMode: "environment", appState: "background",
    });
    assert.deepEqual(reports[0].error, { name: "NativeCallOperationError", message: `native_call_${phase}_failed` });
    assert.equal(JSON.stringify(reports).includes(privateMarker), false);
  });
}

test("native failure reporting rejects arbitrary names, domains, codes and enum context", () => {
  const reports = [];
  reportBoundedNativeCallError((scope, error, metadata) => reports.push({ scope, error, metadata }), "capture", {
    name: "private-name", domain: "private-domain", code: "private-code", message: "private-message",
  }, { audio: "private-audio", video: 1, facingMode: "private-facing", appState: "private-state" });
  assert.deepEqual(reports[0].metadata, { phase: "capture", nativeErrorName: "other", nativeErrorDomain: "other" });
  for (const code of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, "12345"]) {
    reportBoundedNativeCallError((_scope, _error, metadata) => assert.equal(Object.hasOwn(metadata, "nativeErrorCode"), false),
      "capture", { code });
  }
  reportBoundedNativeCallError((_scope, _error, metadata) => assert.equal(metadata.nativeErrorCode, "ERR_UNEXPECTED"),
    "request_answer", { code: "ERR_UNEXPECTED" });
});

test("hostile error getters and a broken reporter cannot escape the diagnostic boundary", () => {
  const error = new Proxy({}, { get() { throw new Error("private getter failure"); } });
  let attempts = 0;
  assert.doesNotThrow(() => reportBoundedNativeCallError(() => {
    attempts += 1;
    throw new Error("reporter failure");
  }, "capture", error, error));
  assert.equal(attempts, 1);
});
