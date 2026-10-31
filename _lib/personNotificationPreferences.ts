import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { invokeAccountBoundSupabaseRpc, isAccountBoundSupabaseRpcOutcomeAmbiguous } from "./accountBoundSupabaseRpc.mjs";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { Platform } from "react-native";

export type PersonNotificationChoices = { liveStarts: boolean | null; watchPartyStarts: boolean | null; joinedLive: boolean };
export type PersonNotificationPreferences = PersonNotificationChoices & {
  actorUserId: string; revision: number; following: boolean; circle: boolean;
};
export class PersonNotificationPreferenceError extends Error {
  constructor(readonly kind: "conflict" | "unavailable" | "unknown") {
    super(kind === "conflict" ? "These choices changed elsewhere. Reload before saving again."
      : kind === "unknown" ? "We could not confirm the save. Reload to check your choices before trying again."
      : "Notification choices are unavailable right now. Try again later.");
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const choice = (value: unknown) => value === null || typeof value === "boolean";
type PendingWrite = { args: Record<string, unknown>; previous: PersonNotificationPreferences; next: PersonNotificationChoices;
  authority: AccountSessionAuthorityBinding; uncertainPredecessor: boolean;
  inFlight: boolean; transport: Promise<{ data: unknown; error: { message?: string } | null }> };
const pendingWrites = new Map<string, PendingWrite>();
const ownerKey = (authority: AccountSessionAuthorityBinding, actor: string) => JSON.stringify([authority.userId, authority.accountId, authority.sessionGeneration, actor]);
async function observe<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PersonNotificationPreferenceError("unknown")), 10_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export function parsePersonNotificationPreferences(value: unknown, actorUserId: string): PersonNotificationPreferences {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!row || row.actorUserId !== actorUserId || !choice(row.liveStarts) || !choice(row.watchPartyStarts)
    || typeof row.joinedLive !== "boolean" || typeof row.following !== "boolean" || typeof row.circle !== "boolean"
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0) throw new PersonNotificationPreferenceError("unavailable");
  return { actorUserId, liveStarts: row.liveStarts as boolean | null, watchPartyStarts: row.watchPartyStarts as boolean | null,
    joinedLive: row.joinedLive, revision: Number(row.revision), following: row.following, circle: row.circle };
}
function assertCurrent(authority: AccountSessionAuthorityBinding, actorUserId: string) {
  if (!uuid.test(actorUserId) || actorUserId === authority.userId || authority.restoreOnly
    || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) {
    throw new PersonNotificationPreferenceError("unavailable");
  }
  // An old session's settled ambiguity cannot permanently consume a new
  // session's UI budget. This retires local recovery only, never claims rollback.
  for (const [key, entry] of pendingWrites) if (!entry.inFlight && !sameAccountSessionAuthority(entry.authority, authority)) pendingWrites.delete(key);
}
export async function readPersonNotificationPreferences(actorUserId: string, authority: AccountSessionAuthorityBinding) {
  authority = { ...authority };
  assertCurrent(authority, actorUserId);
  // Reopening after Close/deadline cannot present stale editable values while
  // this client's exact write is still in flight. No automatic mutation retry.
  const pending = pendingWrites.get(ownerKey(authority, actorUserId));
  const priorResult = pending ? await observe(pending.transport) : null;
  assertCurrent(authority, actorUserId);
  const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
  assertCurrent(authority, actorUserId);
  if (!sameAccountSessionAuthority(subject.authority, authority)) throw new PersonNotificationPreferenceError("unavailable");
  const result = await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "read_person_notification_preferences", { p_actor_user_id: actorUserId });
  assertCurrent(authority, actorUserId);
  if (result.error) throw new PersonNotificationPreferenceError("unavailable");
  const confirmed = parsePersonNotificationPreferences(result.data, actorUserId);
  const latest = pendingWrites.get(ownerKey(authority, actorUserId));
  if (latest && latest !== pending) throw new PersonNotificationPreferenceError("unknown");
  if (pending && pendingWrites.get(ownerKey(authority, actorUserId)) === pending) {
    // A completed HTTP request with an ambiguous result is not proof the server
    // stopped. An unchanged revision cannot authorize a contradictory save.
    const rejected = !pending.uncertainPredecessor && priorResult?.error && !isAccountBoundSupabaseRpcOutcomeAmbiguous(priorResult.error);
    if (confirmed.revision <= pending.previous.revision && !rejected) throw new PersonNotificationPreferenceError("unknown");
    pendingWrites.delete(ownerKey(authority, actorUserId));
  }
  return confirmed;
}
export function hasPendingPersonNotificationSave(actorUserId: string, authority: AccountSessionAuthorityBinding) {
  return pendingWrites.has(ownerKey(authority, actorUserId));
}
export async function retryPersonNotificationPreferences(actorUserId: string, authority: AccountSessionAuthorityBinding) {
  assertCurrent(authority, actorUserId);
  const pending = pendingWrites.get(ownerKey(authority, actorUserId));
  if (!pending || pending.inFlight) throw new PersonNotificationPreferenceError("unknown");
  return savePersonNotificationPreferences(pending.previous, pending.next, authority, pending);
}
export async function savePersonNotificationPreferences(previous: PersonNotificationPreferences, next: PersonNotificationChoices, authority: AccountSessionAuthorityBinding, retry?: PendingWrite) {
  authority = { ...authority };
  assertCurrent(authority, previous.actorUserId);
  previous = parsePersonNotificationPreferences(previous, previous.actorUserId);
  if (!choice(next.liveStarts) || !choice(next.watchPartyStarts) || typeof next.joinedLive !== "boolean") throw new PersonNotificationPreferenceError("unavailable");
  next = { liveStarts: next.liveStarts, watchPartyStarts: next.watchPartyStarts, joinedLive: next.joinedLive };
  const key = ownerKey(authority, previous.actorUserId);
  const atCapacity = () => [...pendingWrites.values()].filter(entry => sameAccountSessionAuthority(entry.authority, authority)).length >= 2
    || [...pendingWrites.values()].filter(entry => entry.inFlight).length >= 8;
  if ((pendingWrites.has(key) && pendingWrites.get(key) !== retry) || (!retry && atCapacity())) throw new PersonNotificationPreferenceError("unknown");
  const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
  assertCurrent(authority, previous.actorUserId);
  if (!sameAccountSessionAuthority(subject.authority, authority)) throw new PersonNotificationPreferenceError("unavailable");
  // A deadline does not cancel a write. CAS protects against an old request
  // arriving after a reload/newer save; never automatically resend on timeout.
  if ((pendingWrites.has(key) && pendingWrites.get(key) !== retry) || (!retry && atCapacity()) || retry?.inFlight) throw new PersonNotificationPreferenceError("unknown");
  const args = {
    p_actor_user_id: previous.actorUserId, p_live_starts: next.liveStarts, p_watch_party_starts: next.watchPartyStarts,
    p_joined_live: next.joinedLive, p_expected_revision: previous.revision,
  };
  const transport = invokeAccountBoundSupabaseRpc({ supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY,
    accessToken: subject.accessToken, functionName: "set_person_notification_preferences", args, clientPlatform: Platform.OS });
  const entry: PendingWrite = { args, transport, previous: { ...previous }, next: { liveStarts: next.liveStarts, watchPartyStarts: next.watchPartyStarts, joinedLive: next.joinedLive },
    authority: { ...authority }, uncertainPredecessor: !!retry, inFlight: true };
  pendingWrites.set(key, entry);
  // Retain transport ownership beyond the display deadline; no credentials
  // stored in this registry. A late response cannot update component state.
  const settled = () => { entry.inFlight = false;
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) && pendingWrites.get(key) === entry) pendingWrites.delete(key); };
  void transport.then(settled, settled);
  const result = await observe(transport);
  assertCurrent(authority, previous.actorUserId);
  if (result.error) {
    if (!entry.uncertainPredecessor && !isAccountBoundSupabaseRpcOutcomeAmbiguous(result.error) && pendingWrites.get(key) === entry) pendingWrites.delete(key);
    throw new PersonNotificationPreferenceError(result.error.message?.includes("person_notification_conflict") ? "conflict" : "unknown");
  }
  let saved: PersonNotificationPreferences;
  try { saved = parsePersonNotificationPreferences(result.data, previous.actorUserId); }
  catch { throw new PersonNotificationPreferenceError("unknown"); }
  if (saved.revision !== previous.revision + 1 || saved.liveStarts !== next.liveStarts
    || saved.watchPartyStarts !== next.watchPartyStarts || saved.joinedLive !== next.joinedLive) throw new PersonNotificationPreferenceError("unknown");
  if (pendingWrites.get(key) === entry) pendingWrites.delete(key);
  return saved;
}
