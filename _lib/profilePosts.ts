import type { Tables, TablesInsert } from "../supabase/database.types";

import { supabase } from "./supabase";

export const PROFILE_POSTS_TABLE = "profile_posts";
export const PROFILE_POST_BODY_LIMIT = 500;

export type ProfilePostVisibility = "public" | "draft";
export type ProfilePostModerationStatus = "clean" | "reported" | "hidden" | "removed";

export type ProfilePost = {
  id: string;
  userId: string;
  body: string;
  visibility: ProfilePostVisibility;
  moderationStatus: ProfilePostModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProfilePostRow = Tables<"profile_posts">;
type ProfilePostInsert = TablesInsert<"profile_posts">;

const PROFILE_POST_SELECT =
  "id,user_id,body,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeVisibility = (value: unknown): ProfilePostVisibility => (
  normalizeText(value).toLowerCase() === "draft" ? "draft" : "public"
);

const normalizeModerationStatus = (value: unknown): ProfilePostModerationStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "reported" || normalized === "hidden" || normalized === "removed") {
    return normalized;
  }
  return "clean";
};

const parseProfilePost = (row: ProfilePostRow): ProfilePost => ({
  id: normalizeText(row.id),
  userId: normalizeText(row.user_id),
  body: normalizeText(row.body),
  visibility: normalizeVisibility(row.visibility),
  moderationStatus: normalizeModerationStatus(row.moderation_status),
  moderationReason: normalizeText(row.moderation_reason) || null,
  moderatedAt: normalizeText(row.moderated_at) || null,
  moderatedBy: normalizeText(row.moderated_by) || null,
  createdAt: normalizeText(row.created_at) || new Date().toISOString(),
  updatedAt: normalizeText(row.updated_at) || normalizeText(row.created_at) || new Date().toISOString(),
});

async function getRequiredUserId() {
  const { data, error } = await supabase.auth.getSession();
  const userId = normalizeText(data.session?.user?.id);
  if (error || !userId) {
    throw new Error("Sign in before posting a profile update.");
  }
  return userId;
}

export async function readProfilePosts(
  userId: string,
  options?: { includeDrafts?: boolean; limit?: number },
): Promise<ProfilePost[]> {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return [];

  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 20))));
  let query = supabase
    .from(PROFILE_POSTS_TABLE)
    .select(PROFILE_POST_SELECT)
    .eq("user_id", normalizedUserId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!options?.includeDrafts) {
    query = query
      .eq("visibility", "public")
      .in("moderation_status", ["clean", "reported"]);
  }

  const { data, error } = await query.returns<ProfilePostRow[]>();
  if (error || !data) return [];
  return data.map(parseProfilePost);
}

export async function createProfilePost(input: {
  body: string;
  visibility?: ProfilePostVisibility;
}): Promise<ProfilePost> {
  const userId = await getRequiredUserId();
  const body = normalizeText(input.body);
  if (!body) throw new Error("Write an update before posting.");
  if (body.length > PROFILE_POST_BODY_LIMIT) {
    throw new Error(`Profile updates can be ${PROFILE_POST_BODY_LIMIT} characters or fewer.`);
  }

  const payload: ProfilePostInsert = {
    user_id: userId,
    body,
    visibility: normalizeVisibility(input.visibility),
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PROFILE_POSTS_TABLE)
    .insert(payload)
    .select(PROFILE_POST_SELECT)
    .returns<ProfilePostRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to post this update right now.");
  return parseProfilePost(data);
}

export async function deleteProfilePost(postId: string): Promise<void> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) return;

  const { error } = await supabase
    .from(PROFILE_POSTS_TABLE)
    .delete()
    .eq("id", normalizedPostId);

  if (error) throw error;
}
