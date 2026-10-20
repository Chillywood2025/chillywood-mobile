import type { Database, TablesInsert, TablesUpdate } from "../supabase/database.types";
import { createClient } from "@supabase/supabase-js";
import { assertAccountBoundSupabaseMutationSubjectCurrent, captureAccountBoundSupabaseMutationSubject, type AccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";

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
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return toText(data.session?.user?.id) || null;
}

async function captureEngagement() {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  // Freeze transport identity as well as row ownership for the entire operation.
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => { assertAccountBoundSupabaseMutationSubjectCurrent(subject); return subject.accessToken; },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { subject, client };
}
type EngagementOperation = { subject: AccountBoundSupabaseMutationSubject; client: typeof supabase };

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

async function readViewerTitleRelationships(titleId: string, operation: EngagementOperation) {
  assertAccountBoundSupabaseMutationSubjectCurrent(operation.subject);
  const { data, error } = await operation.client
    .from(USER_CONTENT_RELATIONSHIPS_TABLE)
    .select(CONTENT_RELATIONSHIP_SELECT)
    .eq("user_id", operation.subject.authority.userId)
    .eq("title_id", titleId)
    .in("relationship_type", ["like", "share"])
    .returns<UserContentRelationshipRow[]>();

  if (error) throw error;
  assertAccountBoundSupabaseMutationSubjectCurrent(operation.subject);
  return data ?? [];
}

async function setTitleRelationship(
  titleId: string,
  relationshipType: ContentRelationshipType,
  isActive: boolean,
  captured?: EngagementOperation,
): Promise<TitleEngagementState> {
  const normalizedTitleId = toText(titleId);
  if (!normalizedTitleId) {
    throw new Error("Title id is required.");
  }

  const operation = captured ?? await captureEngagement();
  const viewerUserId = operation.subject.authority.userId;
  assertAccountBoundSupabaseMutationSubjectCurrent(operation.subject);

  if (!isActive) {
    const { error } = await operation.client
      .from(USER_CONTENT_RELATIONSHIPS_TABLE)
      .delete()
      .eq("user_id", viewerUserId)
      .eq("title_id", normalizedTitleId)
      .eq("relationship_type", relationshipType);

    if (error) throw error;
    return parseTitleEngagementState(normalizedTitleId, viewerUserId, await readViewerTitleRelationships(normalizedTitleId, operation));
  }

  const payload: UserContentRelationshipInsert & UserContentRelationshipUpdate = {
    user_id: viewerUserId,
    title_id: normalizedTitleId,
    relationship_type: relationshipType,
    updated_at: new Date().toISOString(),
  };

  const { error } = await operation.client
    .from(USER_CONTENT_RELATIONSHIPS_TABLE)
    .upsert(payload, { onConflict: "user_id,title_id,relationship_type" });

  if (error) throw error;

  return parseTitleEngagementState(normalizedTitleId, viewerUserId, await readViewerTitleRelationships(normalizedTitleId, operation));
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

  const operation = await captureEngagement();
  if (operation.subject.authority.userId !== viewerUserId) throw new Error("The signed-in account changed.");
  const rows = await readViewerTitleRelationships(normalizedTitleId, operation);
  return parseTitleEngagementState(normalizedTitleId, viewerUserId, rows);
}

export async function setTitleLike(titleId: string, liked: boolean) {
  return setTitleRelationship(titleId, "like", liked);
}

export async function toggleTitleLike(titleId: string) {
  const normalizedTitleId = toText(titleId);
  if (!normalizedTitleId) throw new Error("Title id is required.");
  const operation = await captureEngagement();
  const rows = await readViewerTitleRelationships(normalizedTitleId, operation);
  const currentState = parseTitleEngagementState(normalizedTitleId, operation.subject.authority.userId, rows);
  return setTitleRelationship(normalizedTitleId, "like", !currentState.liked, operation);
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
