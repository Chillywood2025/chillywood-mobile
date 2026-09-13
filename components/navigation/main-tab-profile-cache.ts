import type { UserChannelProfile } from "../../_lib/userData";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "../../_lib/accountSessionAuthority";

type MainTabHeaderProfileSnapshot = {
  authority: AccountSessionAuthorityBinding | null;
  profile: UserChannelProfile | null;
  resolved: boolean;
};

let mainTabHeaderProfileSnapshot: MainTabHeaderProfileSnapshot = {
  authority: null,
  profile: null,
  resolved: false,
};

export function getMainTabHeaderProfileSnapshot(
  expectedAuthority?: AccountSessionAuthorityBinding | null,
): MainTabHeaderProfileSnapshot {
  if (
    !expectedAuthority
    || !sameAccountSessionAuthority(expectedAuthority, getCurrentAccountSessionAuthoritySnapshot())
    || !sameAccountSessionAuthority(expectedAuthority, mainTabHeaderProfileSnapshot.authority)
    || mainTabHeaderProfileSnapshot.profile?.id !== expectedAuthority.userId
  ) {
    return { authority: null, profile: null, resolved: false };
  }
  return mainTabHeaderProfileSnapshot;
}

export function setMainTabHeaderProfileSnapshot(
  profile: UserChannelProfile | null,
  resolved: boolean,
  expectedAuthority: AccountSessionAuthorityBinding,
) {
  if (
    !sameAccountSessionAuthority(expectedAuthority, getCurrentAccountSessionAuthoritySnapshot())
    || (profile && profile.id !== expectedAuthority.userId)
  ) {
    return false;
  }
  if (
    profile
    && !resolved
    && !profile.avatarUrl
    && mainTabHeaderProfileSnapshot.profile?.id === profile.id
    && mainTabHeaderProfileSnapshot.profile.avatarUrl
  ) {
    mainTabHeaderProfileSnapshot = {
      authority: { ...expectedAuthority },
      profile: mainTabHeaderProfileSnapshot.profile,
      resolved: mainTabHeaderProfileSnapshot.resolved,
    };
    return true;
  }

  mainTabHeaderProfileSnapshot = {
    authority: { ...expectedAuthority },
    profile,
    resolved,
  };
  return true;
}
