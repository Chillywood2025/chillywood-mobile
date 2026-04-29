import type { Tables, TablesInsert } from "../supabase/database.types";

import { supabase } from "./supabase";

export const PROFILE_POSTS_TABLE = "profile_posts";
export const PROFILE_POST_COMMENTS_TABLE = "profile_post_comments";
export const PROFILE_POST_LIKES_TABLE = "profile_post_likes";
export const PROFILE_POST_BODY_LIMIT = 500;
export const PROFILE_POST_COMMENT_BODY_LIMIT = 500;

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

export type ProfilePostComment = {
  id: string;
  postId: string;
  userId: string;
  body: string;
  moderationStatus: ProfilePostModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfilePostEngagementState = {
  postId: string;
  viewerUserId: string | null;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  canLike: boolean;
  canComment: boolean;
};

type ProfilePostRow = Tables<"profile_posts">;
type ProfilePostInsert = TablesInsert<"profile_posts">;
type ProfilePostCommentRow = Tables<"profile_post_comments">;
type ProfilePostCommentInsert = TablesInsert<"profile_post_comments">;
type ProfilePostLikeInsert = TablesInsert<"profile_post_likes">;

const PROFILE_POST_SELECT =
  "id,user_id,body,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";
const PROFILE_POST_COMMENT_SELECT =
  "id,post_id,user_id,body,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

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

const parseProfilePostComment = (row: ProfilePostCommentRow): ProfilePostComment => ({
  id: normalizeText(row.id),
  postId: normalizeText(row.post_id),
  userId: normalizeText(row.user_id),
  body: normalizeText(row.body),
  moderationStatus: normalizeModerationStatus(row.moderation_status),
  moderationReason: normalizeText(row.moderation_reason) || null,
  moderatedAt: normalizeText(row.moderated_at) || null,
  moderatedBy: normalizeText(row.moderated_by) || null,
  createdAt: normalizeText(row.created_at) || new Date().toISOString(),
  updatedAt: normalizeText(row.updated_at) || normalizeText(row.created_at) || new Date().toISOString(),
});

async function getSignedInUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return normalizeText(data.session?.user?.id) || null;
}

async function getRequiredUserId() {
  const userId = await getSignedInUserId();
  if (!userId) throw new Error("Sign in before posting.");
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

export async function readProfilePostEngagementState(postId: string): Promise<ProfilePostEngagementState> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) {
    throw new Error("Profile post id is required.");
  }

  const viewerUserId = await getSignedInUserId();
  const [likeCountResult, commentCountResult, viewerLikeResult] = await Promise.all([
    supabase
      .from(PROFILE_POST_LIKES_TABLE)
      .select("post_id", { count: "exact", head: true })
      .eq("post_id", normalizedPostId),
    supabase
      .from(PROFILE_POST_COMMENTS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("post_id", normalizedPostId)
      .is("deleted_at", null)
      .in("moderation_status", ["clean", "reported"]),
    viewerUserId
      ? supabase
          .from(PROFILE_POST_LIKES_TABLE)
          .select("post_id")
          .eq("post_id", normalizedPostId)
          .eq("user_id", viewerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (likeCountResult.error) throw likeCountResult.error;
  if (commentCountResult.error) throw commentCountResult.error;
  if (viewerLikeResult.error) throw viewerLikeResult.error;

  return {
    postId: normalizedPostId,
    viewerUserId,
    likeCount: Math.max(0, Number(likeCountResult.count ?? 0)),
    commentCount: Math.max(0, Number(commentCountResult.count ?? 0)),
    likedByViewer: !!viewerLikeResult.data,
    canLike: !!viewerUserId,
    canComment: !!viewerUserId,
  };
}

export async function readProfilePostComments(
  postId: string,
  options?: { limit?: number },
): Promise<ProfilePostComment[]> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) return [];

  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 12))));
  const { data, error } = await supabase
    .from(PROFILE_POST_COMMENTS_TABLE)
    .select(PROFILE_POST_COMMENT_SELECT)
    .eq("post_id", normalizedPostId)
    .is("deleted_at", null)
    .in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<ProfilePostCommentRow[]>();

  if (error || !data) return [];
  return data.map(parseProfilePostComment);
}

export async function createProfilePostComment(input: {
  postId: string;
  body: string;
}): Promise<ProfilePostComment> {
  const userId = await getRequiredUserId();
  const postId = normalizeText(input.postId);
  const body = normalizeText(input.body);
  if (!postId) throw new Error("Profile post id is required.");
  if (!body) throw new Error("Write a comment before posting.");
  if (body.length > PROFILE_POST_COMMENT_BODY_LIMIT) {
    throw new Error(`Comments can be ${PROFILE_POST_COMMENT_BODY_LIMIT} characters or fewer.`);
  }

  const payload: ProfilePostCommentInsert = {
    post_id: postId,
    user_id: userId,
    body,
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PROFILE_POST_COMMENTS_TABLE)
    .insert(payload)
    .select(PROFILE_POST_COMMENT_SELECT)
    .returns<ProfilePostCommentRow>()
    .single();

  if (error || !data) throw error ?? new Error("Unable to post this comment right now.");
  return parseProfilePostComment(data);
}

export async function deleteProfilePostComment(commentId: string): Promise<void> {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) return;

  const { error } = await supabase
    .from(PROFILE_POST_COMMENTS_TABLE)
    .delete()
    .eq("id", normalizedCommentId);

  if (error) throw error;
}

export async function setProfilePostLike(postId: string, liked: boolean): Promise<ProfilePostEngagementState> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) {
    throw new Error("Profile post id is required.");
  }

  const userId = await getRequiredUserId();
  if (!liked) {
    const { error } = await supabase
      .from(PROFILE_POST_LIKES_TABLE)
      .delete()
      .eq("post_id", normalizedPostId)
      .eq("user_id", userId);

    if (error) throw error;
    return readProfilePostEngagementState(normalizedPostId);
  }

  const payload: ProfilePostLikeInsert = {
    post_id: normalizedPostId,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(PROFILE_POST_LIKES_TABLE)
    .upsert(payload, { onConflict: "post_id,user_id" });

  if (error) throw error;
  return readProfilePostEngagementState(normalizedPostId);
}
