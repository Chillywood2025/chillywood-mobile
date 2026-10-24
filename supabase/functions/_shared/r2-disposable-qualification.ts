import { DEADLINE, MAX_RECONCILIATIONS, OBJECTS, RUN_ID, manifestHash, sha256 } from "./r2-disposable-qualification-manifest.ts";
import type { Observation, Origin } from "./r2-disposable-qualification-origin.ts";

export type Action = "prepare" | "read" | "conflict" | "cleanup" | "reconcile" | "status";
type Step = "put_control" | "put_target" | "read" | "conflict_target" | "delete_target" | "delete_control" | "cleanup_verify";
type Phase = "new" | "prepared" | "read_verified" | "conflict_verified" | "cleanup_started" | "cleaned" | "blocked";
export type RunState = {
  schema: 1; runId: string; manifestHash: string; revision: number; phase: Phase;
  pending: Step | null; completed: Step[]; reconciliations: number;
  requestBudgetReserved: number; observations: Observation[]; updatedAt: string;
};
// Implemented by the canonical isolated SQL ledger and fixed-project RPC adapter.
// One pre-seeded exact row, linearizable CAS, monotonic revisions, no reset,
// delete, TTL or missing-row creation. Setup and cleanup approval remain separate.
export type DurableRunStore = {
  read: () => Promise<RunState | null>;
  compareAndSwap: (expectedRevision: number, next: RunState) => Promise<boolean>;
};
export async function initialState(): Promise<RunState> {
  return { schema: 1, runId: RUN_ID, manifestHash: await manifestHash(), revision: 0, phase: "new",
    pending: null, completed: [], reconciliations: 0, requestBudgetReserved: 0, observations: [], updatedAt: "2026-10-23T00:00:00.000Z" };
}
const timestamp = (now: () => number) => new Date(now()).toISOString();
const output = (state: RunState, status: string = state.phase) => ({
  status, requestBudgetReserved: state.requestBudgetReserved,
  completedSteps: state.completed.length, reconciliationCount: state.reconciliations,
  observations: state.observations, updatedAt: state.updatedAt,
});
const originalPair = async (observations: Observation[]) => observations.length === 2 &&
  observations.every((o) => o.status === 200) &&
  observations[0].byteCount === new TextEncoder().encode(OBJECTS.control.payload).length &&
  observations[1].byteCount === new TextEncoder().encode(OBJECTS.target.payload).length &&
  observations[0].sha256 === await sha256(new TextEncoder().encode(OBJECTS.control.payload)) &&
  observations[1].sha256 === await sha256(new TextEncoder().encode(OBJECTS.target.payload));

export async function runQualification(action: Action, deps: {
  store: DurableRunStore; origin: Origin; now: () => number; cleanupApproved: boolean;
}) {
  if (!["prepare", "read", "conflict", "cleanup", "reconcile", "status"].includes(action)) throw Error("action_not_allowlisted");
  const state = await deps.store.read();
  if (!state || state.schema !== 1 || state.runId !== RUN_ID || state.manifestHash !== await manifestHash()) throw Error("durable_run_unavailable");
  let current = state;
  const blocked = () => current.phase === "blocked";
  const commit = async (patch: Partial<RunState>) => {
    const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: timestamp(deps.now) };
    if (!await deps.store.compareAndSwap(current.revision, next)) throw Error("concurrent_or_unconfirmed_state");
    current = next;
  };
  const open = () => { if (!Number.isFinite(deps.now()) || deps.now() >= Date.parse(DEADLINE)) throw Error("deadline_passed"); };
  if (action === "status") return output(current, current.pending ? "pending_reconcile_required" : current.phase);
  open();
  if (action === "cleanup" && !deps.cleanupApproved) throw Error("cleanup_not_approved");
  const pair = async () => [await deps.origin("get_control"), await deps.origin("get_target")];
  if (action === "reconcile") {
    if (!current.pending) return output(current);
    if (current.reconciliations >= MAX_RECONCILIATIONS) throw Error("reconciliation_limit");
    // Reserve the two read requests durably before dispatch. Never replay a PUT.
    await commit({ reconciliations: current.reconciliations + 1, requestBudgetReserved: current.requestBudgetReserved + 2 });
    const observations = await pair(), pending = current.pending;
    const deleteObservedAbsent = (pending === "delete_control" && observations[0].status === 404) ||
      (pending === "delete_target" && observations[1].status === 404);
    if (deleteObservedAbsent && current.phase === "cleanup_started") {
      // Only DELETE can finish late now: writes were durably fenced first.
      await commit({ observations, pending: null, completed: [...current.completed, pending!] });
      return output(current, "delete_absence_reconciled");
    }
    if (pending === "read" && await originalPair(observations)) {
      await commit({ observations, pending: null, completed: [...current.completed, "read"], phase: "read_verified" });
      return output(current);
    }
    if (pending === "cleanup_verify" && current.phase === "cleanup_started" && observations.every((o) => o.status === 404)) {
      await commit({ observations, pending: null, completed: [...current.completed, "cleanup_verify"], phase: "cleaned" });
      return output(current);
    }
    await commit({ observations });
    // Missing/matching bytes do not prove a timed-out PUT cannot complete later.
    // No guessed timeout, expired lease, or GET clears an uncertain write.
    return output(current, "write_or_delete_outcome_unresolved");
  }
  if (current.pending) return output(current, "pending_reconcile_required");
  if (current.phase === "cleaned" || current.phase === "blocked") return output(current);
  const step = async (name: Step, budget: number, work: () => Promise<{ ok: boolean; observations?: Observation[] }>, phase: Phase) => {
    if (current.completed.includes(name)) return;
    open();
    await commit({ pending: name, requestBudgetReserved: current.requestBudgetReserved + budget });
    // Any exception leaves the durable intent pending. No automatic replay.
    const result = await work();
    await commit({ pending: null, completed: [...current.completed, name],
      phase: result.ok ? phase : "blocked", observations: result.observations ?? current.observations });
  };
  if (action === "prepare") {
    if (current.phase !== "new") return output(current);
    await step("put_control", 2, async () => ({ ok: (await deps.origin("put_control")).status === 200 }), "new");
    if (blocked()) return output(current);
    await step("put_target", 2, async () => ({ ok: (await deps.origin("put_target")).status === 200 }), "prepared");
  } else if (action === "read") {
    if (current.phase !== "prepared") return output(current);
    await step("read", 2, async () => {
      const observations = await pair(); return { ok: await originalPair(observations), observations };
    }, "read_verified");
  } else if (action === "conflict") {
    if (current.phase !== "read_verified") return output(current);
    await step("conflict_target", 4, async () => {
      const response = await deps.origin("conflict_target"), observations = await pair();
      return { ok: response.status === 412 && await originalPair(observations), observations };
    }, "conflict_verified");
  } else if (action === "cleanup") {
    if (!["conflict_verified", "cleanup_started"].includes(current.phase)) return output(current);
    // Permanent fence commits before the first DELETE. No later phase permits PUT.
    if (current.phase !== "cleanup_started") await commit({ phase: "cleanup_started" });
    for (const name of ["delete_target", "delete_control"] as const) {
      await step(name, 2, async () => ({ ok: (await deps.origin(name)).status === 204 }), "cleanup_started");
      if (blocked()) return output(current);
    }
    // Both DELETE receipts plus bounded full GET/404 observations, not a
    // permanent absence claim or an atomic conditional DELETE qualification.
    await step("cleanup_verify", 2, async () => {
      const observations = await pair(); return { observations, ok: observations.every((o) => o.status === 404) };
    }, "cleaned");
  }
  return output(current);
}
