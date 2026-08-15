import { supabase } from "./supabase";
export type AccountSessionAuthorityBinding = {
  userId: string; accountId: string; sessionGeneration: string; state: "ACTIVE"; restoreOnly: boolean;
};
type SessionAuthorityRpc = PromiseLike<{ data: unknown; error: { message?: string } | null }>;
let currentSnapshot: AccountSessionAuthorityBinding | null = null;
const snapshotListeners = new Set<(value: AccountSessionAuthorityBinding | null) => void>();
const exactText = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function parseAccountSessionAuthorityReadback(value: unknown): AccountSessionAuthorityBinding | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const userId = exactText(row.userId); const accountId = exactText(row.accountId);
  const sessionGeneration = exactText(row.sessionGeneration);
  if (row.authoritative !== true || row.state !== "ACTIVE" || typeof row.restoreOnly !== "boolean") return null;
  if (!userId || !accountId || !sessionGeneration) return null;
  return { userId, accountId, sessionGeneration, state: "ACTIVE", restoreOnly: row.restoreOnly };
}
export function sameAccountSessionAuthority(left?: AccountSessionAuthorityBinding | null, right?: AccountSessionAuthorityBinding | null) {
  return !!left && !!right && left.state === "ACTIVE" && right.state === "ACTIVE"
    && left.userId === right.userId && left.accountId === right.accountId
    && left.sessionGeneration === right.sessionGeneration && left.restoreOnly === right.restoreOnly;
}
export function getCurrentAccountSessionAuthoritySnapshot() {
  return currentSnapshot ? { ...currentSnapshot } : null;
}
export function publishAccountSessionAuthoritySnapshot(value: AccountSessionAuthorityBinding | null) {
  currentSnapshot = value ? { ...value } : null;
  snapshotListeners.forEach((listener) => listener(getCurrentAccountSessionAuthoritySnapshot()));
}
export function subscribeToAccountSessionAuthority(listener: (value: AccountSessionAuthorityBinding | null) => void) {
  snapshotListeners.add(listener);
  return () => { snapshotListeners.delete(listener); };
}
export async function readCurrentAccountSessionAuthority(): Promise<AccountSessionAuthorityBinding | null> {
  const rpc = (supabase.rpc as unknown as (fn: "wave1_session_authority_readback") => SessionAuthorityRpc)(
    "wave1_session_authority_readback",
  );
  const { data, error } = await rpc;
  return error ? null : parseAccountSessionAuthorityReadback(data);
}
export async function isCurrentAccountSessionAuthority(expected: AccountSessionAuthorityBinding) {
  return sameAccountSessionAuthority(expected, await readCurrentAccountSessionAuthority());
}
