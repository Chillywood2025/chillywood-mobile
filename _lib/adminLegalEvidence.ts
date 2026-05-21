import { supabase } from "./supabase";

export type LegalEvidenceAction = "preview" | "search" | "export" | "place_hold" | "release_hold";
export type LegalEvidenceTargetType =
  | "user_id"
  | "content_id"
  | "room_id"
  | "chat_thread_id"
  | "report_id"
  | "date_range";

export type LegalEvidenceRequestInput = {
  action: LegalEvidenceAction;
  reason: string;
  targetType?: LegalEvidenceTargetType | string | null;
  targetId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  holdId?: string | null;
};

export type LegalEvidenceResult = {
  ok: boolean;
  preview: Record<string, unknown> | null;
  request: Record<string, unknown> | null;
  exportRecord: Record<string, unknown> | null;
  hold: Record<string, unknown> | null;
};

const toObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function requestLegalEvidenceAction(input: LegalEvidenceRequestInput): Promise<LegalEvidenceResult> {
  const { data, error } = await supabase.functions.invoke("admin-legal-evidence", {
    body: {
      action: input.action,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      holdId: input.holdId ?? null,
      reason: input.reason,
      targetId: input.targetId ?? null,
      targetType: input.targetType ?? null,
    },
  });

  if (error) throw error;
  const payload = toObject(data);
  return {
    exportRecord: toObject(payload.export),
    hold: toObject(payload.hold),
    ok: payload.ok === true,
    preview: toObject(payload.preview),
    request: toObject(payload.request),
  };
}
