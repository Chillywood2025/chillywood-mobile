// OFFLINE PROPOSAL ONLY. These two approval gates are deliberately closed.
// No env var or HTTP field may enable a run or approve cleanup.
export const RUN_APPROVED = false;
export const CLEANUP_APPROVED = false;
export const RUN_ID = "r2-retention-qualification-20261023-01";
export const DEADLINE = "2026-10-24T20:00:00.000Z";
export const BUCKET = "chillywood-media-origin";
// Synthetic placeholder, not a production account. Commissioning must replace
// this with the specifically approved non-secret endpoint before the first run.
// It is part of the durable manifest: account drift must never retarget cleanup.
export const R2_ENDPOINT = "https://00000000000000000000000000000000.r2.cloudflarestorage.com";
export const OBJECTS = Object.freeze({
  target: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/target.txt",
    payload: "Synthetic R2 retention qualification target. No user content. Revision A.\n",
  }),
  control: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/control.txt",
    payload: "Synthetic R2 retention qualification control. Must remain unchanged.\n",
  }),
});
export const CONFLICT_PAYLOAD = "Synthetic R2 retention qualification target. No user content. Revision B.\n";
export const MAX_OBJECT_BYTES = 1024;
export const MAX_RECONCILIATIONS = 3;
export type ObjectName = keyof typeof OBJECTS;
export type Operation = "put_control" | "put_target" | "get_control" | "get_target" |
  "conflict_target" | "delete_target" | "delete_control";
export const sha256 = async (bytes: Uint8Array) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
  (n) => n.toString(16).padStart(2, "0"),
).join("");
export const manifestHash = () => sha256(new TextEncoder().encode(JSON.stringify({
  runId: RUN_ID, deadline: DEADLINE, bucket: BUCKET, endpoint: R2_ENDPOINT, objects: OBJECTS,
  conflictPayload: CONFLICT_PAYLOAD, maxObjectBytes: MAX_OBJECT_BYTES,
  maxReconciliations: MAX_RECONCILIATIONS,
})));
