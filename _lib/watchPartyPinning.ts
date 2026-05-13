import AsyncStorage from "@react-native-async-storage/async-storage";

export const WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY = "chillywood.watchPartyLive.pinnedParticipantId";
export const WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY = "chillywood.watchPartyLive.pinCoachSeen";

export const readWatchPartyLivePinnedParticipantId = async () => {
  try {
    return String(await AsyncStorage.getItem(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY) ?? "").trim();
  } catch {
    return "";
  }
};

export const saveWatchPartyLivePinnedParticipantId = async (participantId: string) => {
  const safeParticipantId = String(participantId ?? "").trim();
  try {
    if (safeParticipantId) {
      await AsyncStorage.setItem(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY, safeParticipantId);
    } else {
      await AsyncStorage.removeItem(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY);
    }
  } catch {
    // Pinning is local UI state; storage failures should not affect the room.
  }
};

export const clearWatchPartyLivePinnedParticipantId = async () => {
  try {
    await AsyncStorage.removeItem(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY);
  } catch {
    // Pinning is local UI state; storage failures should not affect the room.
  }
};

export const readWatchPartyLivePinCoachSeen = async () => {
  try {
    return (await AsyncStorage.getItem(WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY)) === "1";
  } catch {
    return false;
  }
};

export const markWatchPartyLivePinCoachSeen = async () => {
  try {
    await AsyncStorage.setItem(WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY, "1");
  } catch {
    // Coachmark persistence is best-effort local state.
  }
};
