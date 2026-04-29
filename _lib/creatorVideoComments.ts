import type { Tables, TablesInsert } from "../supabase/database.types";

import { supabase } from "./supabase";

export const CREATOR_VIDEO_COMMENTS_TABLE = "creator_video_comments";
export const CREATOR_VIDEO_COMMENT_BODY_LIMIT = 500;

export type CreatorVideoCommentModerationStatus = "clean" | "reported" | "hidden" | "removed";

export type CreatorVideoComment = {
  id: string;
  videoId: string;
  userId: string;
  body: string;
  moderationStatus: CreatorVideoCommentModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
};

type CreatorVideoCommentRow = Tables<"creator_video_comments">;
type CreatorVideoCommentInsert = TablesInsert<"creator_video_comments">;
type UserProfileRow = Pick<Tables<"user_profiles">, "user_id" | "display_name" | "username" | "avatar_url">;

const CREATOR_VIDEO_COMMENT_SELECT =
  "id,video_id,user_id,body,moderation_status,moderation_reason,moderated_at,moderated_by,created_at,updated_at";

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeModerationStatus = (value: unknown): CreatorVideoCommentModerationStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "reported" || normalized === "hidden" || normalized === "removed") {
    return normalized;
  }
  return "clean";
};

const normalizeLimit = (value: unknown, fallback = 24) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
};

async function getRequiredUserId() {
  const { data, error } = await supabase.auth.getSession();
  const userId = normalizeText(data.session?.user?.id);
  if (error || !userId) {
    throw new Error("Sign in before commenting.");
  }
  return userId;
}

async function readAuthorProfiles(userIds: string[]) {
  const normalizedIds = Array.from(new Set(userIds.map(normalizeText).filter(Boolean)));
  if (!normalizedIds.length) return new Map<string, UserProfileRow>();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,display_name,username,avatar_url")
    .in("user_id", normalizedIds)
    .returns<UserProfileRow[]>();

  if (error || !data) return new Map<string, UserProfileRow>();
  return new Map(data.map((row) => [normalizeText(row.user_id), row]));
}

const parseCreatorVideoComment = (
  row: CreatorVideoCommentRow,
  authors: Map<string, UserProfileRow>,
): CreatorVideoComment => {
  const userId = normalizeText(row.user_id);
  const author = authors.get(userId) ?? null;
  const username = normalizeText(author?.username) || null;
  const displayName = normalizeText(author?.display_name) || username || "Viewer";

  return {
    id: normalizeText(row.id),
    videoId: normalizeText(row.video_id),
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
  };
};

export async function readCreatorVideoComments(
  videoId: string,
  options?: { limit?: number },
): Promise<CreatorVideoComment[]> {
  const normalizedVideoId = normalizeText(videoId);
  if (!normalizedVideoId) return [];

  const { data, error } = await supabase
    .from(CREATOR_VIDEO_COMMENTS_TABLE)
    .select(CREATOR_VIDEO_COMMENT_SELECT)
    .eq("video_id", normalizedVideoId)
    .is("deleted_at", null)
    .in("moderation_status", ["clean", "reported"])
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(options?.limit))
    .returns<CreatorVideoCommentRow[]>();

  if (error || !data) return [];

  const authors = await readAuthorProfiles(data.map((row) => row.user_id));
  return data.map((row) => parseCreatorVideoComment(row, authors)).reverse();
}

export async function createCreatorVideoComment(input: {
  videoId: string;
  body: string;
}): Promise<CreatorVideoComment> {
  const userId = await getRequiredUserId();
  const videoId = normalizeText(input.videoId);
  const body = normalizeText(input.body);
  if (!videoId) throw new Error("Missing creator video.");
  if (!body) throw new Error("Write a comment before posting.");
  if (body.length > CREATOR_VIDEO_COMMENT_BODY_LIMIT) {
    throw new Error(`Comments can be ${CREATOR_VIDEO_COMMENT_BODY_LIMIT} characters or fewer.`);
  }

  const payload: CreatorVideoCommentInsert = {
    video_id: videoId,
    user_id: userId,
    body,
    moderation_status: "clean",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(CREATOR_VIDEO_COMMENTS_TABLE)
    .insert(payload)
    .select(CREATOR_VIDEO_COMMENT_SELECT)
    .returns<CreatorVideoCommentRow>()
    .single();

  const created = data as CreatorVideoCommentRow | null;
  if (error || !created) throw error ?? new Error("Unable to post this comment right now.");

  const authors = await readAuthorProfiles([created.user_id]);
  return parseCreatorVideoComment(created, authors);
}

export async function deleteCreatorVideoComment(commentId: string): Promise<void> {
  const normalizedCommentId = normalizeText(commentId);
  if (!normalizedCommentId) return;

  const { error } = await supabase
    .from(CREATOR_VIDEO_COMMENTS_TABLE)
    .delete()
    .eq("id", normalizedCommentId);

  if (error) throw error;
}
