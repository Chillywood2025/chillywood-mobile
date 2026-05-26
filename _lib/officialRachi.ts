import type { Json } from "../supabase/database.types";

import { RACHI_OFFICIAL_ACCOUNT } from "./officialAccounts";
import { readCreatorVideos, type CreatorVideo } from "./creatorVideos";
import { readProfilePosts, type ProfilePost, type ProfilePostVisibility } from "./profilePosts";
import { supabase } from "./supabase";

export type OfficialRachiPostResult = ProfilePost & {
  auditId: string | null;
  actorRole: string | null;
};

const toText = (value: unknown) => String(value ?? "").trim();

const normalizeVisibility = (value: unknown): ProfilePostVisibility => (
  toText(value).toLowerCase() === "draft" ? "draft" : "public"
);

const parseOfficialRachiPostResult = (payload: Json | null): OfficialRachiPostResult => {
  const record = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  return {
    id: toText(record.id),
    userId: toText(record.userId) || RACHI_OFFICIAL_ACCOUNT.userId,
    body: toText(record.body),
    visibility: normalizeVisibility(record.visibility),
    moderationStatus: "clean",
    moderationReason: toText(record.moderationReason) || null,
    moderatedAt: toText(record.moderatedAt) || null,
    moderatedBy: toText(record.moderatedBy) || null,
    createdAt: toText(record.createdAt) || new Date().toISOString(),
    updatedAt: toText(record.updatedAt) || toText(record.createdAt) || new Date().toISOString(),
    attachments: [],
    auditId: toText(record.auditId) || null,
    actorRole: toText(record.actorRole) || null,
  };
};

export async function createOfficialRachiPost(input: {
  body: string;
  visibility?: ProfilePostVisibility;
  reason?: string;
}): Promise<OfficialRachiPostResult> {
  const body = toText(input.body);
  if (!body) throw new Error("Write a Rachi update before publishing.");

  const { data, error } = await supabase.rpc("admin_create_official_rachi_post", {
    p_body: body,
    p_visibility: normalizeVisibility(input.visibility),
    p_reason: toText(input.reason) || "Official Rachi update",
  });

  if (error) throw error;
  return parseOfficialRachiPostResult((data ?? null) as Json | null);
}

export async function readOfficialRachiPosts(options?: { includeDrafts?: boolean; limit?: number }): Promise<ProfilePost[]> {
  return readProfilePosts(RACHI_OFFICIAL_ACCOUNT.userId, {
    includeDrafts: options?.includeDrafts,
    limit: options?.limit ?? 8,
  });
}

export async function readOfficialRachiOriginals(options?: { limit?: number }): Promise<CreatorVideo[]> {
  return readCreatorVideos(RACHI_OFFICIAL_ACCOUNT.userId, {
    includeDrafts: false,
    limit: options?.limit ?? 12,
  });
}
