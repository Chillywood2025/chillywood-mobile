import type { Database, Tables, TablesInsert } from "../supabase/database.types";
import { createClient } from "@supabase/supabase-js";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";

import {
  createSocialAttachmentForSurface,
  readSocialAttachmentsForSurfaces,
  isSocialAttachmentOutcomeAmbiguous,
  type SocialAttachment,
  type SocialAttachmentFile,
} from "./socialAttachments";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { decodeProfileFeedCursor, encodeProfileFeedCursor, profileFeedPageLimit, type ProfileFeedPage } from "./profileFeedPagination";
import { UserFacingError } from "./userFacingErrors";

export const PROFILE_POSTS_TABLE = "profile_posts";
export const PROFILE_POST_COMMENTS_TABLE = "profile_post_comments";
export const PROFILE_POST_LIKES_TABLE = "profile_post_likes";
export const PROFILE_POST_BODY_LIMIT = 500;
export const PROFILE_POST_COMMENT_BODY_LIMIT = 500;

export type ProfilePostVisibility = "public";
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
  attachments: SocialAttachment[];
};

export type ProfilePostComment = {
  id: string;
  displayCreatedAt?: string | null;
  postId: string;
  parentCommentId: string | null;
  userId: string;
  body: string;
  moderationStatus: ProfilePostModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  attachments: SocialAttachment[];
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
type UserProfileRow = Pick<Tables<"user_profiles">, "user_id" | "display_name" | "username" | "avatar_url">;

const PROFILE_POST_SELECT =
  "id,user_id,body,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";
const PROFILE_POST_COMMENT_SELECT =
  "id,post_id,parent_comment_id,user_id,body,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeModerationStatus = (value: unknown): ProfilePostModerationStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "reported" || normalized === "hidden" || normalized === "removed") {
    return normalized;
  }
  return "clean";
};

const normalizeProfilePostVisibility = (_value: unknown): ProfilePostVisibility => "public";

const parseProfilePost = (
  row: ProfilePostRow,
  attachments: SocialAttachment[] = [],
): ProfilePost => ({
  id: normalizeText(row.id),
  userId: normalizeText(row.user_id),
  body: normalizeText(row.body),
  visibility: normalizeProfilePostVisibility(row.visibility),
  moderationStatus: normalizeModerationStatus(row.moderation_status),
  moderationReason: normalizeText(row.moderation_reason) || null,
  moderatedAt: normalizeText(row.moderated_at) || null,
  moderatedBy: normalizeText(row.moderated_by) || null,
  createdAt: normalizeText(row.created_at) || new Date().toISOString(),
  updatedAt: normalizeText(row.updated_at) || normalizeText(row.created_at) || new Date().toISOString(),
  attachments,
});

async function readAuthorProfiles(userIds: string[]) {
  const normalizedIds = Array.from(new Set(userIds.map(normalizeText).filter(Boolean)));
  if (!normalizedIds.length) return new Map<string, UserProfileRow>();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,display_name,username,avatar_url")
    .in("user_id", normalizedIds)
    .returns<UserProfileRow[]>();

  if (error) throw error;
  if (!data) throw new Error("Profile authors could not be loaded.");
  return new Map(data.map((row) => [normalizeText(row.user_id), row]));
}

const parseProfilePostComment = (
  row: ProfilePostCommentRow,
  authors: Map<string, UserProfileRow>,
  attachments: SocialAttachment[] = [],
): ProfilePostComment => {
  const userId = normalizeText(row.user_id);
  const author = authors.get(userId) ?? null;
  const username = normalizeText(author?.username) || null;
  const displayName = normalizeText(author?.display_name) || username || "Member";

  return {
    id: normalizeText(row.id),
    postId: normalizeText(row.post_id),
    displayCreatedAt: normalizeText(row.created_at) || null,
    parentCommentId: normalizeText(row.parent_comment_id) || null,
    userId,
    body: normalizeText(row.body),
    moderationStatus: normalizeModerationStatus(row.moderation_status),
    moderationReason: normalizeText(row.moderation_reason) || null,
    moderatedAt: normalizeText(row.moderated_at) || null,
    moderatedBy: normalizeText(row.moderated_by) || null,
    createdAt: normalizeText(row.created_at) || new Date().toISOString(),
    updatedAt: normalizeText(row.updated_at) || normalizeText(row.created_at) || new Date().toISOString(),
    authorName: displayName,
    authorUsername: username,
    authorAvatarUrl: normalizeText(author?.avatar_url) || null,
    attachments,
  };
};

async function getSignedInUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return normalizeText(data.session?.user?.id) || null;
}

function mutationClient(subject: AccountBoundSupabaseMutationSubject) {
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${subject.accessToken}` } },
  });
}

async function readCreateOutcome<T>(request: PromiseLike<{ data: T | null; error: unknown }>, kind: "post" | "comment"): Promise<T> {
  const uncertain = () => new UserFacingError("attachment_action", `Your ${kind} may already be saved. Refresh before trying again to avoid a duplicate.`);
  let result: { data: T | null; error: unknown };
  try { result = await request; } catch { throw uncertain(); }
  if (result.error || !result.data) {
    const code = result.error && typeof result.error === "object" && "code" in result.error ? String(result.error.code) : "";
    // An explicit SQL rejection rolled back the statement. A lost HTTP response
    // is not proof of failure and must not invite an immediate duplicate create.
    if ((/^[0-9A-Z]{5}$/.test(code) && code !== "08007" && code !== "40003") || code === "PGRST301" || code === "PGRST302") throw result.error;
    throw uncertain();
  }
  return result.data;
}

export async function readProfilePosts(
  userId: string,
  options?: { includeDrafts?: boolean; limit?: number },
): Promise<ProfilePost[]> {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return [];

  const limit = Math.max(1, Math.min(50, Math.floor(Number(options?.limit ?? 20))));
  const query = supabase
    .from(PROFILE_POSTS_TABLE)
    .select(PROFILE_POST_SELECT)
    .eq("user_id", normalizedUserId)
    .is("deleted_at", null)
    .eq("visibility", "public")
    .in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query.returns<ProfilePostRow[]>();
  if (error) throw error;
  if (!data) throw new Error("Profile posts could not be loaded.");
  const attachmentsByPostId = await readSocialAttachmentsForSurfaces(
    "profile_post",
    data.map((row) => row.id),
    { throwOnUnavailable: true },
  );
  return data.map((row) => parseProfilePost(row, attachmentsByPostId.get(normalizeText(row.id)) ?? []));
}

export async function createProfilePost(input: {
  body: string;
  attachmentFile?: SocialAttachmentFile | null;
  expectedUserId?: string;
}): Promise<ProfilePost> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.expectedUserId);
  const userId = subject.authority.userId;
  const client = mutationClient(subject);
  const body = normalizeText(input.body);
  if (!body) throw new Error("Write an update before posting.");
  if (body.length > PROFILE_POST_BODY_LIMIT) {
    throw new Error(`Profile updates can be ${PROFILE_POST_BODY_LIMIT} characters or fewer.`);
  }

  const payload: ProfilePostInsert = {
    user_id: userId,
    body,
    visibility: "public",
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const data = await readCreateOutcome<ProfilePostRow>(client
    .from(PROFILE_POSTS_TABLE)
    .insert(payload)
    .select(PROFILE_POST_SELECT)
    .returns<ProfilePostRow[]>()
    .single(), "post");
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);

  const post = parseProfilePost(data);
  if (!input.attachmentFile) return post;

  try {
    const attachment = await createSocialAttachmentForSurface({
      surfaceType: "profile_post",
      surfaceId: post.id,
      file: input.attachmentFile,
      mutationSubject: subject,
    });
    return {
      ...post,
      attachments: [attachment],
    };
  } catch (attachmentError) {
    if (isSocialAttachmentOutcomeAmbiguous(attachmentError)) {
      throw new UserFacingError("attachment_action", "Your post was saved, but its attachment could not be confirmed. Refresh before retrying.");
    }
    const rollback = await client.from(PROFILE_POSTS_TABLE).delete().eq("id", post.id);
    if (rollback.error) throw new UserFacingError("attachment_action", "The post was created but its attachment failed. Refresh before retrying to avoid a duplicate.");
    throw attachmentError;
  }
}

export async function readProfilePostsPage(
  userId: string, options: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileFeedPage<ProfilePost>> {
  const owner = normalizeText(userId);
  if (!owner) throw new Error("Profile owner is required.");
  const scope = `profile-posts:${owner}`;
  const cursor = decodeProfileFeedCursor(options.cursor, scope);
  const limit = profileFeedPageLimit(options.limit);
  let query = supabase.from(PROFILE_POSTS_TABLE).select(PROFILE_POST_SELECT)
    .eq("user_id", owner).is("deleted_at", null).eq("visibility", "public")
    .in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (cursor) query = query.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  const { data, error } = await query.returns<ProfilePostRow[]>();
  if (error) throw error;
  if (!data) throw new Error("Profile posts could not be loaded.");
  const rows = data.slice(0, limit);
  const attachments = await readSocialAttachmentsForSurfaces("profile_post", rows.map(row => row.id), { throwOnUnavailable: true });
  const last = rows.at(-1);
  const hasMore = data.length > limit;
  return {
    items: rows.map(row => parseProfilePost(row, attachments.get(normalizeText(row.id)) ?? [])), hasMore,
    nextCursor: hasMore && last ? encodeProfileFeedCursor({ version: 1, scope, at: last.created_at, id: last.id }) : null,
  };
}

/** Exact post links do not depend on the first page of the owner's profile. RLS remains authoritative. */
export async function readProfilePostById(postId: string): Promise<ProfilePost | null> {
  const [post] = await readProfilePostsByIds([postId], { limit: 1 });
  return post ?? null;
}

export async function deleteProfilePost(postId: string, expectedUserId?: string): Promise<void> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) return;

  const subject = await captureAccountBoundSupabaseMutationSubject(expectedUserId);
  const { error } = await mutationClient(subject)
    .from(PROFILE_POSTS_TABLE)
    .delete()
    .eq("id", normalizedPostId);

  if (error) throw error;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
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

/** A bounded page-sized RPC, not three round trips for every card. Missing keys remain unavailable. */
export async function readProfilePostEngagementStates(postIds: string[], signal?: AbortSignal): Promise<Record<string, ProfilePostEngagementState>> {
  if (signal?.aborted) throw new Error("Post engagement request retired.");
  const ids = [...new Set(postIds.map(normalizeText).filter(Boolean))];
  if (ids.length > 50) throw new Error("Read engagement for at most 50 posts at a time.");
  if (!ids.length) return {};
  const viewerUserId = await getSignedInUserId();
  if (signal?.aborted) throw new Error("Post engagement request retired.");
  let request = supabase.rpc("read_profile_post_engagement_batch", { p_post_ids: ids });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (signal?.aborted) throw new Error("Post engagement request retired.");
  if (error) throw error;
  if (!data) throw new Error("Post engagement could not be loaded.");
  return Object.fromEntries(data.map(row => [row.post_id, {
    postId: row.post_id, viewerUserId,
    likeCount: Math.max(0, Number(row.like_count)), commentCount: Math.max(0, Number(row.comment_count)),
    likedByViewer: row.liked_by_viewer, canLike: !!viewerUserId, canComment: !!viewerUserId,
  }]));
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

  if (error) throw error;
  if (!data) throw new Error("Profile comments could not be loaded.");
  const [authors, attachmentsByCommentId] = await Promise.all([
    readAuthorProfiles(data.map((row) => row.user_id)),
    readSocialAttachmentsForSurfaces("profile_post_comment", data.map((row) => row.id), { throwOnUnavailable: true }),
  ]);
  return data.map((row) => (
    parseProfilePostComment(row, authors, attachmentsByCommentId.get(normalizeText(row.id)) ?? [])
  ));
}

export async function readProfilePostsByIds(
  postIds: string[],
  options?: { limit?: number },
): Promise<ProfilePost[]> {
  const normalizedPostIds = Array.from(new Set(postIds.map(normalizeText).filter(Boolean)))
    .slice(0, Math.max(1, Math.min(100, Math.floor(Number(options?.limit ?? 50)))));
  if (!normalizedPostIds.length) return [];

  const { data, error } = await supabase
    .from(PROFILE_POSTS_TABLE)
    .select(PROFILE_POST_SELECT)
    .in("id", normalizedPostIds)
    .is("deleted_at", null)
    .eq("visibility", "public")
    .in("moderation_status", ["clean", "reported"])
    .returns<ProfilePostRow[]>();

  if (error) throw error;
  if (!data) throw new Error("Profile posts could not be loaded.");
  const attachmentsByPostId = await readSocialAttachmentsForSurfaces(
    "profile_post",
    data.map((row) => row.id),
    { throwOnUnavailable: true },
  );
  const order = new Map(normalizedPostIds.map((id, index) => [id, index]));
  return data
    .map((row) => parseProfilePost(row, attachmentsByPostId.get(normalizeText(row.id)) ?? []))
    .sort((left, right) => (
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
}

/** Flat chronological pages preserve the existing one-level reply model; callers append by ID. */
export async function readProfilePostCommentsPage(
  postId: string, options: { limit?: number; cursor?: string | null } = {},
): Promise<ProfileFeedPage<ProfilePostComment>> {
  const target = normalizeText(postId);
  if (!target) throw new Error("Profile post is required.");
  const scope = `profile-comments:${target}`;
  const cursor = decodeProfileFeedCursor(options.cursor, scope);
  const limit = profileFeedPageLimit(options.limit);
  let query = supabase.from(PROFILE_POST_COMMENTS_TABLE).select(PROFILE_POST_COMMENT_SELECT)
    .eq("post_id", target).is("deleted_at", null).in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(limit + 1);
  if (cursor) query = query.or(`created_at.gt.${cursor.at},and(created_at.eq.${cursor.at},id.gt.${cursor.id})`);
  const { data, error } = await query.returns<ProfilePostCommentRow[]>();
  if (error) throw error;
  if (!data) throw new Error("Profile comments could not be loaded.");
  const rows = data.slice(0, limit);
  const [authors, attachments] = await Promise.all([
    readAuthorProfiles(rows.map(row => row.user_id)),
    readSocialAttachmentsForSurfaces("profile_post_comment", rows.map(row => row.id), { throwOnUnavailable: true }),
  ]);
  const last = rows.at(-1);
  const hasMore = data.length > limit;
  return {
    items: rows.map(row => parseProfilePostComment(row, authors, attachments.get(normalizeText(row.id)) ?? [])), hasMore,
    nextCursor: hasMore && last ? encodeProfileFeedCursor({ version: 1, scope, at: last.created_at, id: last.id }) : null,
  };
}

export async function createProfilePostComment(input: {
  postId: string;
  body: string;
  parentCommentId?: string | null;
  attachmentFile?: SocialAttachmentFile | null;
  expectedUserId?: string;
}): Promise<ProfilePostComment> {
  const subject = await captureAccountBoundSupabaseMutationSubject(input.expectedUserId);
  const userId = subject.authority.userId;
  const client = mutationClient(subject);
  const postId = normalizeText(input.postId);
  const body = normalizeText(input.body);
  if (!postId) throw new Error("Profile post id is required.");
  if (!body) throw new Error("Write a comment before posting.");
  if (body.length > PROFILE_POST_COMMENT_BODY_LIMIT) {
    throw new Error(`Comments can be ${PROFILE_POST_COMMENT_BODY_LIMIT} characters or fewer.`);
  }

  const payload: ProfilePostCommentInsert = {
    post_id: postId,
    parent_comment_id: normalizeText(input.parentCommentId) || null,
    user_id: userId,
    body,
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const data = await readCreateOutcome<ProfilePostCommentRow>(client
    .from(PROFILE_POST_COMMENTS_TABLE)
    .insert(payload)
    .select(PROFILE_POST_COMMENT_SELECT)
    .returns<ProfilePostCommentRow[]>()
    .single(), "comment");

  const created = data as ProfilePostCommentRow | null;
  if (!created) throw new Error("Unable to post this comment right now.");
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  // Author enrichment must not turn a successful create into a misleading failure/retry.
  const authors = await readAuthorProfiles([created.user_id]).catch(() => new Map<string, UserProfileRow>());
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const comment = parseProfilePostComment(created, authors);
  if (!input.attachmentFile) return comment;

  try {
    const attachment = await createSocialAttachmentForSurface({
      surfaceType: "profile_post_comment",
      surfaceId: comment.id,
      file: input.attachmentFile,
      mutationSubject: subject,
    });
    return {
      ...comment,
      attachments: [attachment],
    };
  } catch (attachmentError) {
    if (isSocialAttachmentOutcomeAmbiguous(attachmentError)) {
      throw new UserFacingError("attachment_action", "Your comment was saved, but its attachment could not be confirmed. Refresh before retrying.");
    }
    const rollback = await client.from(PROFILE_POST_COMMENTS_TABLE).delete().eq("id", comment.id);
    if (rollback.error) throw new UserFacingError("attachment_action", "The comment was created but its attachment failed. Refresh before retrying to avoid a duplicate.");
    throw attachmentError;
  }
}

export async function deleteProfilePostComment(commentId: string, expectedUserId?: string): Promise<void> {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) return;

  const subject = await captureAccountBoundSupabaseMutationSubject(expectedUserId);
  const { error } = await mutationClient(subject)
    .from(PROFILE_POST_COMMENTS_TABLE)
    .delete()
    .eq("id", normalizedCommentId);

  if (error) throw error;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
}

export async function setProfilePostLike(postId: string, liked: boolean, expectedUserId?: string): Promise<ProfilePostEngagementState> {
  const normalizedPostId = normalizeText(postId);
  if (!normalizedPostId) {
    throw new Error("Profile post id is required.");
  }

  const subject = await captureAccountBoundSupabaseMutationSubject(expectedUserId);
  const userId = subject.authority.userId;
  const client = mutationClient(subject);
  if (!liked) {
    const { error } = await client
      .from(PROFILE_POST_LIKES_TABLE)
      .delete()
      .eq("post_id", normalizedPostId)
      .eq("user_id", userId);

    if (error) throw error;
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    const result = await readProfilePostEngagementState(normalizedPostId);
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    return result;
  }

  const payload: ProfilePostLikeInsert = {
    post_id: normalizedPostId,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  const { error } = await client
    .from(PROFILE_POST_LIKES_TABLE)
    .upsert(payload, { onConflict: "post_id,user_id" });

  if (error) throw error;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const result = await readProfilePostEngagementState(normalizedPostId);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return result;
}
