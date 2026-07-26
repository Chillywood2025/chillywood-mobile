import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyExpoPushReceipt } from "./expo-push-receipt-policy.mjs";

test("DeviceNotRegistered receipts revoke the associated Expo token on every platform", () => {
  const receipt = {
    status: "error",
    message: "The device is no longer registered.",
    details: { error: "DeviceNotRegistered" },
  };

  for (const platform of ["android", "ios"]) {
    const result = classifyExpoPushReceipt({ ...receipt, platform });
    assert.equal(result.isError, true);
    assert.equal(result.errorCode, "DeviceNotRegistered");
    assert.equal(result.shouldRevokeToken, true);
  }
});

test("successful receipts and transient provider errors never revoke tokens", () => {
  assert.equal(classifyExpoPushReceipt({ status: "ok" }).shouldRevokeToken, false);
  const transient = classifyExpoPushReceipt({
    status: "error",
    details: { error: "MessageRateExceeded" },
  });
  assert.equal(transient.isError, true);
  assert.equal(transient.shouldRevokeToken, false);
});

test("all Expo notification senders use the shared platform-neutral receipt reconciler", () => {
  for (const relativePath of [
    "../chilly-chat-call-dispatch/index.ts",
    "../notification-dispatch/index.ts",
    "../revenuecat-webhook/index.ts",
  ]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /reconcileRecentExpoPushReceipts/u, relativePath);
  }

  const reconciler = readFileSync(new URL("./expo-push-receipts.ts", import.meta.url), "utf8");
  assert.match(reconciler, /\.eq\("provider", "expo"\)/u);
  assert.doesNotMatch(reconciler, /\.eq\("platform"/u);
  assert.match(reconciler, /classification\.shouldRevokeToken/u);
});
