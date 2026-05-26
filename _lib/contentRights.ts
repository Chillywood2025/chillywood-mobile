import { supabase } from "./supabase";

export type ContentRightsSurface =
  | "clip_studio"
  | "creator_video"
  | "live_watch_party"
  | "watch_party_live"
  | "spectator_child_room"
  | "paid_content"
  | "replay";

export type ContentRightsTargetType =
  | "clip"
  | "creator_video"
  | "watch_party_room"
  | "live_room"
  | "spectator_child_room"
  | "content";

export type ContentRightsDisclosureState = {
  containsThirdPartyContent: boolean;
  containsThirdPartyMusic: boolean;
};

export const CONTENT_RIGHTS_POLICY_VERSION = "content-rights-v1";

export const createEmptyContentRightsDisclosure = (): ContentRightsDisclosureState => ({
  containsThirdPartyContent: false,
  containsThirdPartyMusic: false,
});

const toText = (value: unknown) => String(value ?? "").trim();

export const normalizeContentRightsDisclosure = (
  value?: Partial<ContentRightsDisclosureState> | null,
): ContentRightsDisclosureState => ({
  containsThirdPartyContent: value?.containsThirdPartyContent === true,
  containsThirdPartyMusic: value?.containsThirdPartyMusic === true,
});

export const isContentRightsDisclosureActive = (
  value?: Partial<ContentRightsDisclosureState> | null,
) => {
  const normalized = normalizeContentRightsDisclosure(value);
  return normalized.containsThirdPartyContent || normalized.containsThirdPartyMusic;
};

export const formatContentRightsDisclosureSummary = (
  value?: Partial<ContentRightsDisclosureState> | null,
) => {
  const normalized = normalizeContentRightsDisclosure(value);
  if (normalized.containsThirdPartyContent && normalized.containsThirdPartyMusic) {
    return "content_and_music";
  }
  if (normalized.containsThirdPartyMusic) return "music";
  if (normalized.containsThirdPartyContent) return "content";
  return "none";
};

export async function recordContentRightsDisclosure(input: {
  surface: ContentRightsSurface;
  targetType: ContentRightsTargetType;
  targetId: string;
  disclosure: Partial<ContentRightsDisclosureState>;
  sourceContext?: Record<string, unknown> | null;
}): Promise<void> {
  const targetId = toText(input.targetId);
  if (!targetId) return;

  const disclosure = normalizeContentRightsDisclosure(input.disclosure);
  const rpcClient = supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ error?: unknown }>;
  };
  const { error } = await rpcClient.rpc("record_content_rights_disclosure", {
    p_surface: input.surface,
    p_target_type: input.targetType,
    p_target_id: targetId,
    p_contains_third_party_content: disclosure.containsThirdPartyContent,
    p_contains_third_party_music: disclosure.containsThirdPartyMusic,
    p_disclosure_note: null,
    p_policy_version: CONTENT_RIGHTS_POLICY_VERSION,
    p_source_context: input.sourceContext ?? {},
  });
  if (error) throw error;
}
