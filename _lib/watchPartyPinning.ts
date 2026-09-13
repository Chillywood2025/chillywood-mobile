import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCurrentAccountSessionAuthoritySnapshot,
  sameAccountSessionAuthority,
  type AccountSessionAuthorityBinding,
} from "./accountSessionAuthority";

export const WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY = "chillywood.watchPartyLive.pinnedParticipantId";
export const WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY = "chillywood.watchPartyLive.pinCoachSeen";

type WatchPartyPinBinding = AccountSessionAuthorityBinding | null;

const captureWatchPartyPinBinding = (): WatchPartyPinBinding => getCurrentAccountSessionAuthoritySnapshot();

const assertWatchPartyPinBindingCurrent = (binding: WatchPartyPinBinding) => {
  const current = getCurrentAccountSessionAuthoritySnapshot();
  const matches = binding === null ? current === null : sameAccountSessionAuthority(binding, current);
  if (!matches) throw new Error("Account changed while Party Room preferences were loading.");
};

const watchPartyPreferenceKey = (baseKey: string, partyId: string, binding: WatchPartyPinBinding) => {
  const safePartyId = String(partyId ?? "").trim();
  if (!safePartyId) return null;
  const subject = binding?.userId ?? "anonymous";
  return `${baseKey}:account-v1:${encodeURIComponent(subject)}:party:${encodeURIComponent(safePartyId)}`;
};

export const readWatchPartyLivePinnedParticipantId = async (partyId: string) => {
  const binding = captureWatchPartyPinBinding();
  const key = watchPartyPreferenceKey(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY, partyId, binding);
  if (!key) return "";
  try {
    const value = String(await AsyncStorage.getItem(key) ?? "").trim();
    assertWatchPartyPinBindingCurrent(binding);
    return value;
  } catch {
    assertWatchPartyPinBindingCurrent(binding);
    return "";
  }
};

export const saveWatchPartyLivePinnedParticipantId = async (partyId: string, participantId: string) => {
  const binding = captureWatchPartyPinBinding();
  const key = watchPartyPreferenceKey(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY, partyId, binding);
  if (!key) return;
  const safeParticipantId = String(participantId ?? "").trim();
  try {
    assertWatchPartyPinBindingCurrent(binding);
    if (safeParticipantId) {
      await AsyncStorage.setItem(key, safeParticipantId);
    } else {
      await AsyncStorage.removeItem(key);
    }
    assertWatchPartyPinBindingCurrent(binding);
  } catch {
    assertWatchPartyPinBindingCurrent(binding);
    // Pinning is local UI state; storage failures should not affect the room.
  }
};

export const clearWatchPartyLivePinnedParticipantId = async (partyId: string) => {
  const binding = captureWatchPartyPinBinding();
  const key = watchPartyPreferenceKey(WATCH_PARTY_LIVE_PINNED_PARTICIPANT_KEY, partyId, binding);
  if (!key) return;
  try {
    assertWatchPartyPinBindingCurrent(binding);
    await AsyncStorage.removeItem(key);
    assertWatchPartyPinBindingCurrent(binding);
  } catch {
    assertWatchPartyPinBindingCurrent(binding);
    // Pinning is local UI state; storage failures should not affect the room.
  }
};

export const readWatchPartyLivePinCoachSeen = async (partyId: string) => {
  const binding = captureWatchPartyPinBinding();
  const key = watchPartyPreferenceKey(WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY, partyId, binding);
  if (!key) return false;
  try {
    const seen = (await AsyncStorage.getItem(key)) === "1";
    assertWatchPartyPinBindingCurrent(binding);
    return seen;
  } catch {
    assertWatchPartyPinBindingCurrent(binding);
    return false;
  }
};

export const markWatchPartyLivePinCoachSeen = async (partyId: string) => {
  const binding = captureWatchPartyPinBinding();
  const key = watchPartyPreferenceKey(WATCH_PARTY_LIVE_PIN_COACH_SEEN_KEY, partyId, binding);
  if (!key) return;
  try {
    assertWatchPartyPinBindingCurrent(binding);
    await AsyncStorage.setItem(key, "1");
    assertWatchPartyPinBindingCurrent(binding);
  } catch {
    assertWatchPartyPinBindingCurrent(binding);
    // Coachmark persistence is best-effort local state.
  }
};
