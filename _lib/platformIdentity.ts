import { formatUsernameHandle } from "./usernameHandles";
import type { UserChannelProfile, UserProfile } from "./userData";

export type PlatformDisplayIdentity = {
  displayName: string;
  handle: string | null;
  profileDisplayName: string | null;
  profileHandle: string | null;
  isUsingGeneratedFallback: boolean;
};

const GENERATED_USERNAME_PATTERN = /^user\d{4,}$/i;

const toText = (value: unknown) => String(value ?? "").trim();

export const isGeneratedPlatformIdentityValue = (value: unknown) => {
  const normalized = toText(value);
  return GENERATED_USERNAME_PATTERN.test(normalized);
};

const nullableText = (value: unknown) => {
  const normalized = toText(value);
  return normalized.length ? normalized : null;
};

const normalizeHandle = (value: unknown) => {
  const formatted = formatUsernameHandle(value);
  return formatted.length ? formatted : null;
};

export const resolvePlatformDisplayIdentity = (input: {
  channel?: Pick<UserChannelProfile, "displayName" | "handle"> | null;
  profile?: Pick<UserProfile, "displayName" | "username"> | null;
  platformDisplayName?: unknown;
  platformHandle?: unknown;
  fallbackDisplayName?: string;
}): PlatformDisplayIdentity => {
  const platformDisplayName = nullableText(input.platformDisplayName);
  const channelDisplayName = nullableText(input.channel?.displayName);
  const profileDisplayName = nullableText(input.profile?.displayName);
  const profileHandle = normalizeHandle(input.profile?.username ?? input.channel?.handle);
  const platformHandle = normalizeHandle(input.platformHandle);
  const channelHandle = normalizeHandle(input.channel?.handle);
  const profileUsername = nullableText(input.profile?.username);
  const fallbackDisplayName = nullableText(input.fallbackDisplayName) ?? "Untitled Platform";

  const displayCandidates = [
    profileDisplayName,
    channelDisplayName,
    platformDisplayName,
    profileUsername,
    channelHandle?.replace(/^@/, ""),
  ].filter(Boolean) as string[];

  const displayName = displayCandidates.find((candidate) => !isGeneratedPlatformIdentityValue(candidate))
    ?? fallbackDisplayName;
  const handle = profileHandle ?? channelHandle ?? platformHandle;

  return {
    displayName,
    handle,
    profileDisplayName,
    profileHandle,
    isUsingGeneratedFallback: isGeneratedPlatformIdentityValue(displayName),
  };
};
