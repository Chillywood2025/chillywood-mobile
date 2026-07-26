import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY,
  resolveFetchedRuntimeUpdateActivationKey,
  resolvePendingRuntimeUpdateActivationKey,
} from "../_lib/runtimeUpdateActivationPolicy.mjs";

const pending = (overrides = {}) => resolvePendingRuntimeUpdateActivationKey({
  currentUpdateId: "old-update",
  downloadedUpdateId: "new-update",
  inFlightActivationKey: null,
  isEmbeddedLaunch: false,
  isRollbackToEmbedded: false,
  isUpdatePending: true,
  ...overrides,
});

assert.equal(pending(), "new-update", "a downloaded pending update must activate");
assert.equal(pending({ isUpdatePending: false }), null, "a non-pending update must not reload");
assert.equal(pending({ currentUpdateId: "new-update" }), null, "the running update must not reload itself");
assert.equal(pending({ inFlightActivationKey: "new-update" }), null, "one process must schedule one reload per update");
assert.equal(pending({ downloadedUpdateId: null }), null, "missing downloaded identity must fail closed");
assert.equal(
  pending({ downloadedUpdateId: null, isRollbackToEmbedded: true }),
  ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY,
  "a pending rollback must activate",
);
assert.equal(
  pending({ downloadedUpdateId: null, isEmbeddedLaunch: true, isRollbackToEmbedded: true }),
  null,
  "an embedded launch must not re-apply the embedded rollback",
);
assert.equal(resolveFetchedRuntimeUpdateActivationKey({
  currentUpdateId: "old-update",
  fetchedUpdateId: "new-update",
}), "new-update", "a freshly fetched update must activate");

const source = readFileSync(new URL("../_lib/runtimeUpdates.tsx", import.meta.url), "utf8");
assert.match(source, /Updates\.useUpdates\(\)/, "the gate must observe native pending-update state");
assert.match(source, /updatesState\.isUpdatePending/, "pending native downloads must trigger activation");
assert.match(source, /reloadRequestedRef\.current = null/, "a failed reload must become retryable");
assert.doesNotMatch(source, /InteractionManager/, "activation must not wait indefinitely for interactions");
assert.doesNotMatch(source, /lastReloadFingerprint|LAST_RELOAD_FINGERPRINT_KEY/, "reload suppression must not persist across app processes");

console.log(JSON.stringify({
  assertions: 13,
  status: "passed",
}, null, 2));
