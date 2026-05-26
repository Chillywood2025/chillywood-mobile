export type OfficialPlatformAccount = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  handle: string;
  tagline: string;
  channelRole: "viewer" | "host" | "creator";
  officialBadgeLabel: string;
  platformOwnershipLabel: string;
  platformRoleLabel: string;
  auditOwnerKey: string;
  conciergeHeadline: string;
  trustSummary: string;
  starterWelcomeBody: string;
  starterPrompts: readonly string[];
  guidanceTopics: readonly string[];
};

export const RACHI_OFFICIAL_USER_ID = "platform_rachi_official";

export const RACHI_OFFICIAL_ACCOUNT: OfficialPlatformAccount = {
  userId: RACHI_OFFICIAL_USER_ID,
  displayName: "Rachi",
  handle: "@chillywood.rachi",
  tagline: "Official Chi'llywood guide for updates, tips, and Chi'llwood Originals.",
  channelRole: "creator",
  officialBadgeLabel: "OFFICIAL",
  platformOwnershipLabel: "PLATFORM OWNED",
  platformRoleLabel: "OFFICIAL GUIDE",
  auditOwnerKey: "platform:rachi",
  conciergeHeadline: "Official Chi'llywood guide and Originals publisher.",
  trustSummary:
    "Rachi shares Chi'llywood updates, tips, and Chi'llwood Originals. Rachi does not read your private chats.",
  starterWelcomeBody:
    "Rachi Help is opt-in. Rachi only sees what you send in this help conversation.",
  starterPrompts: [
    "Hi Rachi, help me get started.",
    "Show me where to start in Chi'llywood.",
    "I need official help with my account.",
  ],
  guidanceTopics: [
    "Getting started",
    "Account help",
    "Safety guidance",
    "Official updates",
  ],
};

const OFFICIAL_PLATFORM_ACCOUNTS = [RACHI_OFFICIAL_ACCOUNT] as const;

const normalizeUserId = (value: unknown) => String(value ?? "").trim();

export function getOfficialPlatformAccount(userId: unknown): OfficialPlatformAccount | null {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return null;
  return OFFICIAL_PLATFORM_ACCOUNTS.find((account) => account.userId === normalizedUserId) ?? null;
}

export function isOfficialPlatformAccountUserId(userId: unknown): boolean {
  return !!getOfficialPlatformAccount(userId);
}
