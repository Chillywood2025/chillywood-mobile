import { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";

import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import { readCreatorPermissions, type CreatorPermissionSet } from "../../_lib/monetization";
import { useSession } from "../../_lib/session";
import { readUserProfile, readUserProfileByUserId, type UserProfile } from "../../_lib/userData";

type Presentation = {
  scope: string;
  profile: UserProfile | null;
  permissions: CreatorPermissionSet | null;
  ready: boolean;
  error: boolean;
};

// Only the public, platform-owned identity is retained across route mounts.
// This is metadata, never an authorization decision or a bitmap-ready flag.
let officialSnapshot: { scope: string; profile: UserProfile; expiresAt: number; order: number } | null = null;
let readOrder = 0;
let officialWriteOrder = 0;
const OFFICIAL_SNAPSHOT_MS = 60_000;

export function useProfilePresentation(userId: string, isSelf: boolean) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const official = !!getOfficialPlatformAccount(userId);
  const scope = JSON.stringify([userId, isSelf, authorityStatus, authority?.userId,
    authority?.accountId, authority?.sessionGeneration, authority?.restoreOnly]);
  const current = useCallback(() => authorityStatus === "signed_out"
    ? authority === null && getCurrentAccountSessionAuthoritySnapshot() === null
    : authorityStatus === "active" && !authority?.restoreOnly
      && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()),
  [authority, authorityStatus]);
  const cached = official && current() && officialSnapshot?.scope === scope
    && officialSnapshot.expiresAt > Date.now() ? officialSnapshot.profile : null;
  const [state, setState] = useState<Presentation>(() => ({
    scope, profile: cached, permissions: null, ready: !!cached, error: false,
  }));
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const visible = state.scope === scope && current();

  useEffect(() => {
    const request = ++sequence.current;
    let active = true;
    if (!current()) {
      officialSnapshot = null;
      setState({ scope, profile: null, permissions: null, ready: false, error: false });
      return;
    }
    if (officialSnapshot?.scope !== scope) officialSnapshot = null;
    if (!focused) return;
    const order = ++readOrder;
    const valid = () => active && request === sequence.current && liveScope.current === scope && current();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setState(previous => previous.scope === scope && previous.ready
      ? previous
      : { scope, profile: cached, permissions: null, ready: !!cached, error: false });
    const read = (async () => {
      if (!userId) return { profile: null, permissions: null };
      const [profile, permissions] = await Promise.all([
        isSelf ? readUserProfile() : readUserProfileByUserId(userId),
        official ? Promise.resolve(null) : readCreatorPermissions(userId).catch(() => null),
      ]);
      return { profile, permissions };
    })();
    void Promise.race([read, new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Profile presentation timed out")), 15_000);
    })]).then(({ profile, permissions }) => {
      if (!valid()) return;
      if (official && order >= officialWriteOrder) {
        officialWriteOrder = order;
        officialSnapshot = profile ? { scope, profile, expiresAt: Date.now() + OFFICIAL_SNAPSHOT_MS, order } : null;
      }
      setState({ scope, profile, permissions, ready: true, error: false });
    }).catch(() => {
      if (!valid()) return;
      if (official && order >= officialWriteOrder) {
        officialWriteOrder = order;
        officialSnapshot = null;
      }
      setState({ scope, profile: null, permissions: null, ready: true, error: true });
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
    // A successful cache write is not a new fetch trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, current, focused, retry, userId, isSelf, official]);

  const setProfile = useCallback((profile: UserProfile | null) => {
    if (liveScope.current !== scope || !current()) return;
    sequence.current += 1;
    if (official) {
      officialWriteOrder = ++readOrder;
      officialSnapshot = profile
        ? { scope, profile, expiresAt: Date.now() + OFFICIAL_SNAPSHOT_MS, order: officialWriteOrder } : null;
    }
    setState(previous => ({ scope, profile,
      permissions: previous.scope === scope ? previous.permissions : null, ready: true, error: false }));
  }, [scope, current, official]);

  return {
    profile: visible ? state.profile : null,
    permissions: visible ? state.permissions : null,
    ready: visible && state.ready,
    error: visible && state.error,
    setProfile,
    refresh: useCallback(() => setRetry(value => value + 1), []),
  };
}
