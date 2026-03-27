import { supabase } from "./supabase";

export const SAFETY_REPORTS_TABLE = "safety_reports";

export type SafetyReportTargetType = "participant" | "room" | "title";
export type SafetyReportCategory = "abuse" | "harassment" | "impersonation" | "copyright" | "safety" | "other";

export type SafetyReportInput = {
  targetType: SafetyReportTargetType;
  targetId: string;
  category: SafetyReportCategory;
  note?: string;
  roomId?: string | null;
  titleId?: string | null;
  context?: Record<string, unknown>;
};

export const SAFETY_REPORT_CATEGORIES: SafetyReportCategory[] = [
  "abuse",
  "harassment",
  "impersonation",
  "copyright",
  "safety",
  "other",
];

export async function submitSafetyReport(input: SafetyReportInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const reporterUserId = String(sessionData.session?.user?.id ?? "").trim();

  if (!reporterUserId) {
    throw new Error("Sign in is required before you can send a safety report.");
  }

  const targetId = String(input.targetId ?? "").trim();
  if (!targetId) {
    throw new Error("Missing report target.");
  }

  const payload = {
    reporter_user_id: reporterUserId,
    target_type: input.targetType,
    target_id: targetId,
    category: input.category,
    note: String(input.note ?? "").trim() || null,
    room_id: String(input.roomId ?? "").trim() || null,
    title_id: String(input.titleId ?? "").trim() || null,
    context: input.context ?? {},
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(SAFETY_REPORTS_TABLE)
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data;
}
