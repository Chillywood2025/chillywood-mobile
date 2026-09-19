const text = (value) => String(value ?? "").trim();

const REVOKE_STATUSES = new Set([
  "recovery_only",
  "restricted",
  "restore_only",
  "signed_out",
]);

export const getIosNativeCallAuthorityBindingKey = (authority) => {
  const userId = text(authority?.userId);
  const accountId = text(authority?.accountId);
  const sessionGeneration = text(authority?.sessionGeneration);
  if (
    authority?.state !== "ACTIVE"
    || authority?.restoreOnly !== false
    || !userId
    || accountId !== userId
    || !sessionGeneration
  ) return "";
  return `${userId}:${accountId}:${sessionGeneration}`;
};

export const shouldReuseIosNativeCallReadiness = ({
  currentAuthority,
  nextAuthority,
  registrationActive,
}) => registrationActive === true
  && !!getIosNativeCallAuthorityBindingKey(currentAuthority)
  && getIosNativeCallAuthorityBindingKey(currentAuthority)
    === getIosNativeCallAuthorityBindingKey(nextAuthority);

export const resolveIosNativeCallBridgeLifecycle = ({
  authority,
  authorityStatus,
  hadActiveAuthority,
  userId,
}) => {
  const currentUserId = text(userId);
  const authorityBindingKey = getIosNativeCallAuthorityBindingKey(authority);
  const authorityUserId = text(authority?.userId);
  const exactActiveAuthority = authorityStatus === "active"
    && !!authorityBindingKey
    && authorityUserId === currentUserId;

  if (exactActiveAuthority) {
    return {
      action: "start",
      bindingKey: authorityBindingKey,
    };
  }

  // A terminated app begins with an intentionally empty React session while
  // Supabase restores the already-verified local session. PushKit can launch
  // the process and deliver a VoIP payload during that window. Clearing the
  // exact persisted native binding here makes a valid cold-start call look
  // foreign and forces CallKit to end it before it becomes visible.
  //
  // This exception is initial-hydration only. Once this process has owned an
  // active authority, a later loading state represents an account/session
  // transition and must revoke. Every terminal or indeterminate authority
  // status also revokes. Server delivery remains independently restricted to
  // a live exact auth session generation.
  if (authorityStatus === "loading" && !hadActiveAuthority) {
    return { action: "preserve_cold_start", bindingKey: "" };
  }

  // A bounded authority read can become unknown while the same authenticated
  // session is being revalidated (for example after a transient Home/network
  // refresh failure). Server delivery remains independently bound to the exact
  // live account/session/install generation. Removing the native PushKit
  // binding here leaves an otherwise valid backend token deliverable while the
  // device is no longer registered, so APNs can accept the push without CallKit
  // ever presenting it. Preserve the exact persisted native binding until an
  // explicit terminal authority state or a loading account transition revokes
  // it. Unknown still grants no application or call authority.
  if (authorityStatus === "unknown") {
    return { action: "preserve_transient_unknown", bindingKey: "" };
  }

  if (REVOKE_STATUSES.has(authorityStatus) || hadActiveAuthority || authorityStatus === "active") {
    return { action: "revoke", bindingKey: "" };
  }

  return { action: "revoke", bindingKey: "" };
};
