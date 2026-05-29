import { supabase } from "./supabase";

export type PublicPeopleSearchResult = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  isOfficial: boolean;
  officialLabel: string | null;
  hasPublicPlatform: boolean;
  publicPlatformId: string | null;
  shortBio: string | null;
};

type PublicPeopleSearchRow = {
  user_id?: unknown;
  display_name?: unknown;
  username?: unknown;
  avatar_url?: unknown;
  is_official?: unknown;
  official_label?: unknown;
  has_public_platform?: unknown;
  public_platform_id?: unknown;
  short_bio?: unknown;
};

type PublicPeopleSearchRpc = PromiseLike<{
  data: PublicPeopleSearchRow[] | null;
  error: { message?: string } | null;
}>;

const RACHI_PUBLIC_USER_ID = "platform_rachi_official";
const INTERNAL_ACCOUNT_ID_PREFIXES = [
  "admin_",
  "moderator_",
  "owner_",
  "operator_",
  "proof_",
  "security_",
  "service_",
  "support_",
  "system_",
  "test_",
];
const INTERNAL_ACCOUNT_TEXT_PATTERNS = [
  /\badmin proof\b/,
  /\bmoderator proof\b/,
  /\bowner proof\b/,
  /\boperator proof\b/,
  /\bsecurity proof\b/,
  /\bsupport proof\b/,
  /\bsystem proof\b/,
  /\bservice proof\b/,
  /\bproof account\b/,
  /\btest operator\b/,
  /\binternal operator\b/,
  /\binternal moderator\b/,
  /\binternal support\b/,
];

const toText = (value: unknown) => String(value ?? "").trim();
const toPublicSafetyText = (value: unknown) => toText(value).toLowerCase();

export const isPublicPeopleResultAllowed = (result: PublicPeopleSearchResult) => {
  const userId = toPublicSafetyText(result.userId);
  if (userId === RACHI_PUBLIC_USER_ID) return true;

  const safetyValues = [
    userId,
    toPublicSafetyText(result.username),
    toPublicSafetyText(result.displayName),
  ].filter(Boolean);

  return !safetyValues.some((value) => (
    INTERNAL_ACCOUNT_ID_PREFIXES.some((prefix) => value.startsWith(prefix))
    || INTERNAL_ACCOUNT_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  ));
};

const parsePublicPeopleSearchRow = (row: PublicPeopleSearchRow): PublicPeopleSearchResult | null => {
  const userId = toText(row.user_id);
  if (!userId) return null;

  const username = toText(row.username);
  const displayName = toText(row.display_name) || username || "Member";

  return {
    userId,
    displayName,
    username,
    avatarUrl: toText(row.avatar_url) || null,
    isOfficial: row.is_official === true,
    officialLabel: toText(row.official_label) || null,
    hasPublicPlatform: row.has_public_platform === true,
    publicPlatformId: toText(row.public_platform_id) || null,
    shortBio: toText(row.short_bio) || null,
  };
};

export async function searchPublicPeople(query: string, options?: { limit?: number }): Promise<PublicPeopleSearchResult[]> {
  const normalizedQuery = toText(query);
  const queryWithoutHandlePrefix = normalizedQuery.replace(/^@+/, "");
  if (queryWithoutHandlePrefix.length < 2 || queryWithoutHandlePrefix.includes("@")) return [];

  const limit = Math.max(1, Math.min(25, Math.floor(Number(options?.limit ?? 12)) || 12));
  const rpc = (supabase.rpc as unknown as (
    fn: "search_public_people",
    args: { p_query: string; p_limit: number },
  ) => PublicPeopleSearchRpc)("search_public_people", {
    p_query: normalizedQuery,
    p_limit: limit,
  });

  const { data, error } = await rpc;
  if (error || !data) return [];

  return data
    .map(parsePublicPeopleSearchRow)
    .filter((item): item is PublicPeopleSearchResult => !!item)
    .filter(isPublicPeopleResultAllowed);
}
