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
  starterWelcomeBody: string;
  starterPrompts: readonly string[];
};

export const RACHI_OFFICIAL_USER_ID = "platform_rachi_official";

export const RACHI_OFFICIAL_ACCOUNT: OfficialPlatformAccount = {
  userId: RACHI_OFFICIAL_USER_ID,
  displayName: "Rachi",
  handle: "@chillywood.rachi",
  tagline: "Official Chi'llywood concierge, welcome guide, and moderation-ready helper.",
  channelRole: "creator",
  officialBadgeLabel: "OFFICIAL",
  platformOwnershipLabel: "PLATFORM OWNED",
  platformRoleLabel: "CONCIERGE",
  auditOwnerKey: "platform:rachi",
  starterWelcomeBody:
    "Rachi is Chi'llywood's official starter presence. Open this canonical thread for welcome guidance now, while future moderation, help, and announcement behavior grows on the same platform-owned identity.",
  starterPrompts: [
    "Hi Rachi, help me get started.",
    "Show me where to start in Chi'llywood.",
    "I need official help with my account.",
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
