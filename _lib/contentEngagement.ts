import type { TablesInsert, TablesUpdate } from "../supabase/database.types";

import { supabase } from "./supabase";

export const USER_CONTENT_RELATIONSHIPS_TABLE = "user_content_relationships";

export type ContentRelationshipType = "like" | "share";

export type TitleEngagementState = {
  viewerUserId: string | null;
  titleId: string;
  liked: boolean;
  shared: boolean;
  likeUpdatedAt?: string;
  shareUpdatedAt?: string;
  canLike: boolean;
  canShare: boolean;
};

type UserContentRelationshipInsert = TablesInsert<"user_content_relationships">;
type UserContentRelationshipUpdate = TablesUpdate<"user_content_relationships">;
type UserContentRelationshipRow = {
  relationship_type: string;
  title_id: string;
  updated_at: string;
  user_id: string;
};

const CONTENT_RELATIONSHIP_SELECT = "relationship_type,title_id,updated_at,user_id";

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeRelationshipType = (value: unknown): ContentRelationshipType | null => {
  const normalized = toText(value).toLowerCase();
  if (normalized === "like" || normalized === "share") {
    return normalized;
  }
  return null;
};

async function getSignedInEngagementUserId() {
  const { data } = await supabase.auth.getSession();
  return toText(data.session?.user?.id) || null;
}

async function getRequiredEngagementUserId() {
  const userId = await getSignedInEngagementUserId();
  if (!userId) {
    throw new Error("Chi'llywood engagement requires a signed-in user.");
  }
  return userId;
}

function buildEmptyTitleEngagementState(titleId: string, viewerUserId: string | null): TitleEngagementState {
  return {
    viewerUserId,
    titleId,
    liked: false,
    shared: false,
    canLike: !!viewerUserId,
    canShare: !!viewerUserId,
  };
}

function parseTitleEngagementState(
  titleId: string,
  viewerUserId: string | null,
  rows: UserContentRelationshipRow[] | null | undefined,
): TitleEngagementState {
  const state = buildEmptyTitleEngagementState(titleId, viewerUserId);
  for (const row of rows ?? []) {
    const relationshipType = normalizeRelationshipType(row.relationship_type);
    if (!relationshipType) continue;
    const updatedAt = toText(row.updated_at) || undefined;
    if (relationshipType === "like") {
      state.liked = true;
      state.likeUpdatedAt = updatedAt;
    }
    if (relationshipType === "share") {
      state.shared = true;
      state.shareUpdatedAt = updatedAt;
    }
  }
  return state;
}

async function readViewerTitleRelationships(titleId: string, viewerUserId: string) {
  const { data, error } = await supabase
    .from(USER_CONTENT_RELATIONSHIPS_TABLE)
    .select(CONTENT_RELATIONSHIP_SELECT)
    .eq("user_id", viewerUserId)
    .eq("title_id", titleId)
    .in("relationship_type", ["like", "share"])
    .returns<UserContentRelationshipRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function setTitleRelationship(
  titleId: string,
  relationshipType: ContentRelationshipType,
  isActive: boolean,
): Promise<TitleEngagementState> {
  const normalizedTitleId = toText(titleId);
  if (!normalizedTitleId) {
    throw new Error("Title id is required.");
  }

  const viewerUserId = await getRequiredEngagementUserId();

  if (!isActive) {
    const { error } = await supabase
      .from(USER_CONTENT_RELATIONSHIPS_TABLE)
      .delete()
      .eq("user_id", viewerUserId)
      .eq("title_id", normalizedTitleId)
      .eq("relationship_type", relationshipType);

    if (error) throw error;
    return readTitleEngagementState(normalizedTitleId);
  }

  const payload: UserContentRelationshipInsert & UserContentRelationshipUpdate = {
    user_id: viewerUserId,
    title_id: normalizedTitleId,
    relationship_type: relationshipType,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from(USER_CONTENT_RELATIONSHIPS_TABLE)
    .upsert(payload, { onConflict: "user_id,title_id,relationship_type" });

  if (error) throw error;

  return readTitleEngagementState(normalizedTitleId);
}

export async function readTitleEngagementState(titleId: string): Promise<TitleEngagementState> {
  const normalizedTitleId = toText(titleId);
  if (!normalizedTitleId) {
    throw new Error("Title id is required.");
  }

  const viewerUserId = await getSignedInEngagementUserId();
  if (!viewerUserId) {
    return buildEmptyTitleEngagementState(normalizedTitleId, null);
  }

  const rows = await readViewerTitleRelationships(normalizedTitleId, viewerUserId);
  return parseTitleEngagementState(normalizedTitleId, viewerUserId, rows);
}

export async function setTitleLike(titleId: string, liked: boolean) {
  return setTitleRelationship(titleId, "like", liked);
}

export async function toggleTitleLike(titleId: string) {
  const currentState = await readTitleEngagementState(titleId);
  return setTitleLike(currentState.titleId, !currentState.liked);
}

// Stored share truth is distinct from room invite share-sheet actions.
export async function setTitleShare(titleId: string, shared: boolean) {
  return setTitleRelationship(titleId, "share", shared);
}

export async function markTitleShared(titleId: string) {
  return setTitleShare(titleId, true);
}

export async function clearTitleShare(titleId: string) {
  return setTitleShare(titleId, false);
}
