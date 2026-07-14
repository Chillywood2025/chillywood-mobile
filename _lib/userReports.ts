import { supabase } from "./supabase";

export type UserReportSubmitInput = {
  reportType?: string;
  category?: string;
  severity?: "low" | "review" | "major" | "critical" | "blocking" | "polish" | "insight";
  surface?: string | null;
  route?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  details?: string | null;
  appVersion?: string | null;
  updateId?: string | null;
  runtimeVersion?: string | null;
  devicePlatform?: string | null;
  metadata?: Record<string, unknown>;
};

export async function submitUserReport(input: UserReportSubmitInput) {
  const summary = String(input.summary ?? "").trim();
  const details = String(input.details ?? "").trim();
  if (!summary && !details) {
    throw new Error("Report summary is required.");
  }

  const { data, error } = await supabase.functions.invoke("user-report-intake", {
    body: {
      action: "submit_report",
      reportType: input.reportType,
      category: input.category,
      severity: input.severity,
      surface: input.surface ?? null,
      route: input.route ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      summary,
      details: details || null,
      appVersion: input.appVersion ?? null,
      updateId: input.updateId ?? null,
      runtimeVersion: input.runtimeVersion ?? null,
      devicePlatform: input.devicePlatform ?? null,
      metadata: input.metadata ?? {},
    },
  });

  if (error) throw error;
  return data;
}

export async function getMyUserReportStatus() {
  const { data, error } = await supabase.functions.invoke("user-report-intake", {
    body: { action: "get_my_report_status" },
  });
  if (error) throw error;
  return data;
}
