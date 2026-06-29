import type { UserChannelProfile } from "../../_lib/userData";

type MainTabHeaderProfileSnapshot = {
  profile: UserChannelProfile | null;
  resolved: boolean;
};

let mainTabHeaderProfileSnapshot: MainTabHeaderProfileSnapshot = {
  profile: null,
  resolved: false,
};

export function getMainTabHeaderProfileSnapshot(): MainTabHeaderProfileSnapshot {
  return mainTabHeaderProfileSnapshot;
}

export function setMainTabHeaderProfileSnapshot(profile: UserChannelProfile | null, resolved = true) {
  if (
    profile
    && !resolved
    && !profile.avatarUrl
    && mainTabHeaderProfileSnapshot.profile?.id === profile.id
    && mainTabHeaderProfileSnapshot.profile.avatarUrl
  ) {
    mainTabHeaderProfileSnapshot = {
      profile: mainTabHeaderProfileSnapshot.profile,
      resolved: mainTabHeaderProfileSnapshot.resolved,
    };
    return;
  }

  mainTabHeaderProfileSnapshot = {
    profile,
    resolved,
  };
}
