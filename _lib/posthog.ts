const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

const normalizeText = (value: unknown) => String(value ?? "").trim();

export const posthogFeatureFlags = {
  liveWaitingRoomEnabled: "live_waiting_room_enabled",
  partyWaitingRoomEnabled: "party_waiting_room_enabled",
  watchPartyLiveHandoffV2: "watch_party_live_handoff_v2",
  chillyChatExpandedV1: "chilly_chat_expanded_v1",
  aiChatSuggestionsV1: "ai_chat_suggestions_v1",
} as const;

export const isPostHogFlagEnabled = (value: unknown) => {
  if (value === true) return true;

  const normalized = normalizeText(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "enabled";
};

export const getPostHogConfig = () => {
  const apiKey = normalizeText(process.env.EXPO_PUBLIC_POSTHOG_API_KEY);
  const host = normalizeText(process.env.EXPO_PUBLIC_POSTHOG_HOST) || DEFAULT_POSTHOG_HOST;

  return {
    apiKey,
    host,
    isEnabled: apiKey.length > 0,
  };
};
