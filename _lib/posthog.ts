const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

const normalizeText = (value: unknown) => String(value ?? "").trim();

export const posthogFeatureFlags = {
  liveWaitingRoomEnabled: "live_waiting_room_enabled",
  partyWaitingRoomEnabled: "party_waiting_room_enabled",
  watchPartyLiveHandoffV2: "watch_party_live_handoff_v2",
} as const;

export const getPostHogConfig = () => {
  const apiKey = normalizeText(process.env.EXPO_PUBLIC_POSTHOG_API_KEY);
  const host = normalizeText(process.env.EXPO_PUBLIC_POSTHOG_HOST) || DEFAULT_POSTHOG_HOST;

  return {
    apiKey,
    host,
    isEnabled: apiKey.length > 0,
  };
};
