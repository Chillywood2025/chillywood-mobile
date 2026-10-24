// OFFLINE PROPOSAL ONLY. These two approval gates are deliberately closed.
// No env var or HTTP field may enable a run or approve cleanup.
export const RUN_APPROVED = false;
export const CLEANUP_APPROVED = false;
export const RUN_ID = "r2-retention-qualification-20261023-01";
export const DEADLINE = "2026-10-24T20:00:00.000Z";
export const BUCKET = "chillywood-media-origin";
// Non-secret account/bucket metadata verified read-only on 2026-10-24. This
// binding is NOT commissioning approval; both gates above remain closed.
// Default jurisdiction, ENAM placement; SigV4 region remains auto. Account drift
// must fail closed, never retarget operations or change runtime credentials.
export const R2_ENDPOINT = "https://4771291298ef43dbe09e51f2900e04dc.r2.cloudflarestorage.com";
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
// Permanent, disjoint mutation receipts. These are NOT disposable test objects.
// Commissioning requires verified indefinite provider protection for this exact
// prefix; source cannot infer that a lock exists from this manifest declaration.
export const RECEIPT_PROTECTION = Object.freeze({
  prefix: "qualification/retention/r2-retention-qualification-20261023-01/receipts/",
  lockRuleId: "r2-retention-qualification-20261023-01-receipts",
  condition: "Indefinite",
});
export const MUTATION_RECEIPTS = Object.freeze({
  put_control: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/receipts/put_control.txt",
    payload: "Permanent qualification receipt r2-retention-qualification-20261023-01 put_control. Never delete.\n",
  }),
  put_target: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/receipts/put_target.txt",
    payload: "Permanent qualification receipt r2-retention-qualification-20261023-01 put_target. Never delete.\n",
  }),
  conflict_target: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/receipts/conflict_target.txt",
    payload: "Permanent qualification receipt r2-retention-qualification-20261023-01 conflict_target. Never delete.\n",
  }),
  delete_target: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/receipts/delete_target.txt",
    payload: "Permanent qualification receipt r2-retention-qualification-20261023-01 delete_target. Never delete.\n",
  }),
  delete_control: Object.freeze({
    key: "qualification/retention/r2-retention-qualification-20261023-01/receipts/delete_control.txt",
    payload: "Permanent qualification receipt r2-retention-qualification-20261023-01 delete_control. Never delete.\n",
  }),
});
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
  mutationReceipts: MUTATION_RECEIPTS, receiptProtection: RECEIPT_PROTECTION,
})));
