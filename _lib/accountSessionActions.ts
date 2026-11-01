import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { ACCOUNT_SESSION_STORAGE_KEY, accountSessionStorage, supabase } from "./supabase";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionIdentity, type AccountSessionAuthorityBinding, type LockedLocalAuthClient } from "./accountSessionAuthority";
type LocalAuthSession = { access_token: string; user: { id: string } };

// This is local cleanup identity, never server authorization.
export function accountSessionActionIdentity(value: unknown): AccountSessionAuthorityBinding | null {
  const session = value as LocalAuthSession | null;
  if (!session?.user?.id) return null;
  try {
    const encoded = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(globalThis.atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")));
    if (claims.sub !== session.user.id || typeof claims.session_id !== "string" || !claims.session_id) return null;
    return { userId: session.user.id, accountId: session.user.id, sessionGeneration: claims.session_id, state: "ACTIVE", restoreOnly: false };
  } catch { return null; }
}

export function localSessionMatchesAccountIdentity(value: unknown, expected: AccountSessionAuthorityBinding) {
  return sameAccountSessionIdentity(accountSessionActionIdentity(value), expected);
}

// A retained screen intent may retire even if the same session later returns.
// Recheck its optional lifecycle guard after every pre-dispatch wait completes.
export async function signOutExactAccountSession(expected: AccountSessionAuthorityBinding, isCurrent: () => boolean = () => true) {
  if (!isCurrent()) return false;
  const auth = supabase.auth as unknown as LockedLocalAuthClient & {
    _notifyAllSubscribers(event: "SIGNED_OUT", session: null): Promise<void>;
  };
  await auth.initializePromise;
  // Keep refresh operations behind the auth lock until cleanup completes, while
  // the storage adapter also serializes SDK saves that do not take that lock.
  return auth._acquireLock(auth.lockAcquireTimeout, async () => {
    // _useSession may refresh an expired token and unconditionally remove a
    // session after refresh failure. Capture without that implicit mutation.
    const session = await accountSessionStorage.readSession(ACCOUNT_SESSION_STORAGE_KEY) as LocalAuthSession | null;
    const published = getCurrentAccountSessionAuthoritySnapshot();
    if (!isCurrent() || (published && !sameAccountSessionIdentity(expected, published))
      || !localSessionMatchesAccountIdentity(session, expected)) return false;
    // Pin the initiating token. The SDK's public signOut instead rereads mutable
    // session state and unconditionally removes it after the request.
    const { error: signOutError } = await supabase.auth.admin.signOut(session!.access_token, "global");
    if (signOutError && !isAuthSessionMissingError(signOutError)
      && !(isAuthApiError(signOutError) && [401, 403, 404].includes(signOutError.status))) throw signOutError;
    return accountSessionStorage.removeSessionIf(ACCOUNT_SESSION_STORAGE_KEY,
      value => localSessionMatchesAccountIdentity(value, expected),
      () => auth._notifyAllSubscribers("SIGNED_OUT", null));
  });
}
