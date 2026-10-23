import { manifestHash, RUN_ID } from "./r2-disposable-qualification-manifest.ts";
import type { DurableRunStore, RunState } from "./r2-disposable-qualification.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: unknown }>;
const steps = ["put_control", "put_target", "read", "conflict_target", "delete_target", "delete_control", "cleanup_verify"];
const keys = ["completed", "manifestHash", "observations", "pending", "phase", "reconciliations", "requestBudgetReserved", "revision", "runId", "schema", "updatedAt"];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const integer = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const timestamp = (v: unknown) => typeof v === "string" && /^2026-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

export async function validateQualificationState(value: unknown): Promise<RunState> {
  if (!isObject(value) || JSON.stringify(value).length > 4096 || Object.keys(value).sort().join(",") !== keys.join(",") ||
    value.schema !== 1 || value.runId !== RUN_ID || value.manifestHash !== await manifestHash() ||
    !integer(value.revision, 99) || !integer(value.reconciliations, 3) || !integer(value.requestBudgetReserved, 17) ||
    (value.pending !== null && (typeof value.pending !== "string" || !steps.includes(value.pending))) ||
    !timestamp(value.updatedAt) || !Array.isArray(value.completed) || value.completed.length > 7 ||
    value.completed.some((v, i) => v !== steps[i]) || !Array.isArray(value.observations) || value.observations.length > 2) throw Error("qualification_state_invalid");
  const count = value.completed.length;
  const allowedPhase = ["new", "new", "prepared", "read_verified", "conflict_verified", "cleanup_started", "cleanup_started", "cleaned"][count];
  const cleanupFence = count === 4 && value.phase === "cleanup_started";
  if (value.phase === "blocked") {
    if (count === 0 || value.pending !== null) throw Error("qualification_state_invalid");
  } else if ((value.phase !== allowedPhase && !cleanupFence) ||
    (value.pending !== null && (value.pending !== steps[count] || (count === 4 && !cleanupFence)))) throw Error("qualification_state_invalid");
  for (const observation of value.observations) {
    if (!isObject(observation) || !integer(observation.status, 599) || (observation.status as number) < 100 || !timestamp(observation.observedAt)) throw Error("qualification_state_invalid");
    const expected = observation.status === 200 ? "byteCount,observedAt,sha256,status" : "observedAt,status";
    if (Object.keys(observation).sort().join(",") !== expected || (observation.status === 200 &&
      (!integer(observation.byteCount, 1024) || typeof observation.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(observation.sha256)))) throw Error("qualification_state_invalid");
  }
  return structuredClone(value) as RunState;
}

// Factory has no imports/side effects that create clients, fetch or read secrets.
// Caller must separately supply an exact-authority, fixed-project RPC client.
// No initialize/upsert/reset/approval/delete API, and no automatic retry.
export function createQualificationRunStore(rpc: Rpc): DurableRunStore {
  const call = async (name: string, args: Record<string, unknown>) => {
    try {
      const result = await rpc(name, args);
      if (!result || result.error) throw Error("rpc_failed");
      return result.data;
    } catch { throw Error("qualification_store_unconfirmed"); }
  };
  return {
    read: async () => {
      const data = await call("read_r2_qualification_test_run", { p_run_id: RUN_ID, p_manifest_hash: await manifestHash() });
      if (data === null) return null;
      return validateQualificationState(data);
    },
    compareAndSwap: async (expectedRevision, next) => {
      const state = await validateQualificationState(next);
      if (!integer(expectedRevision, 98) || state.revision !== expectedRevision + 1) throw Error("qualification_revision_invalid");
      const data = await call("cas_r2_qualification_test_run", { p_run_id: RUN_ID, p_manifest_hash: await manifestHash(),
        p_expected_revision: expectedRevision, p_next_state: state });
      if (typeof data !== "boolean") throw Error("qualification_receipt_invalid");
      return data;
    },
  };
}
