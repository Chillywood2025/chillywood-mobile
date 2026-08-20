import { supabase } from "./supabase";
import { withAuthorityReadDeadline } from "./entitlementAuthority";
export type AccountSessionAuthorityBinding = {
  userId: string; accountId: string; sessionGeneration: string; state: "ACTIVE"; restoreOnly: boolean;
};
type LocalAuthSession = { access_token: string; user: { id: string } };
export type LockedLocalAuthClient = {
  initializePromise: Promise<unknown>; lockAcquireTimeout: number;
  _acquireLock<T>(timeout: number, operation: () => Promise<T>): Promise<T>;
  _useSession<T>(operation: (result: { data: { session: LocalAuthSession | null }; error: unknown }) => Promise<T>): Promise<T>;
  _signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
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
  if (!userId || accountId !== userId || !sessionGeneration) return null;
  return { userId, accountId, sessionGeneration, state: "ACTIVE", restoreOnly: row.restoreOnly };
}
export function sameAccountSessionAuthority(left?: AccountSessionAuthorityBinding | null, right?: AccountSessionAuthorityBinding | null) {
  return !!left && !!right && left.state === "ACTIVE" && right.state === "ACTIVE"
    && left.userId === right.userId && left.accountId === right.accountId
    && left.sessionGeneration === right.sessionGeneration && left.restoreOnly === right.restoreOnly;
}
export const recoverySessionIsQuarantined = (
  event: string, current: AccountSessionAuthorityBinding | null,
  ...proofs: (AccountSessionAuthorityBinding | "PENDING_RECOVERY" | null | undefined)[]
) => event === "PASSWORD_RECOVERY" || proofs.some((proof) => proof === "PENDING_RECOVERY" || sameAccountSessionAuthority(current, typeof proof === "object" ? proof : null));
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
  try {
    const rpc = (supabase.rpc as unknown as (fn: "wave1_session_authority_readback") => SessionAuthorityRpc)(
      "wave1_session_authority_readback",
    );
    const result = await withAuthorityReadDeadline<unknown>(rpc, null);
    if (!result || typeof result !== "object" || Array.isArray(result)) return null;
    const { data, error } = result as { data?: unknown; error?: unknown };
    return error ? null : parseAccountSessionAuthorityReadback(data);
  } catch { return null; }
}
export async function isCurrentAccountSessionAuthority(expected: AccountSessionAuthorityBinding) {
  return sameAccountSessionAuthority(expected, await readCurrentAccountSessionAuthority());
}
export async function clearExactLocalAuthSession(auth: LockedLocalAuthClient, expectedUserId: string, expectedAccessToken: string) {
  await auth.initializePromise;
  return auth._acquireLock(auth.lockAcquireTimeout, () => auth._useSession(async ({ data, error }) => {
    if (error) return false;
    if (!data.session) return true;
    if (data.session.user.id !== expectedUserId || data.session.access_token !== expectedAccessToken) return false;
    return !(await auth._signOut({ scope: "local" })).error;
  }));
}
