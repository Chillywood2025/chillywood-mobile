import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";

export type EventScheduleChoice = "keep_ticket" | "request_refund_review";
export type EventTicketSchedule = { startsAt: string; endsAt: string | null; timeZone: string };
export type EventTicketPolicy = {
  eventId: string; purchaseId: string; purchaseIntentId: string | null; buyerId: string;
  originalSchedule: EventTicketSchedule | null;
  currentRevision: EventTicketSchedule & { id: string };
  acceptedRevisionId: string | null; choiceRequired: boolean;
  refundEligibility: { eligibility: "eligible"; status: "provider_review_required";
    reasons: ("event_canceled" | "event_no_show" | "material_schedule_change" | "event_replay_unavailable")[]; createdAt: string } | null;
  history: { revisionId: string; choice: EventScheduleChoice; createdAt: string; schedule: EventTicketSchedule }[];
  notice: { id: string; createdAt: string } | null;
};
export type EventTicketPolicyResult = {
  status: "resolved" | "unavailable"; policy: EventTicketPolicy | null;
  subjectUserId: string | null; subjectSessionGeneration: string | null;
};
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && v === v.trim() && Number.isFinite(Date.parse(v));
const choice = (v: unknown): v is EventScheduleChoice => v === "keep_ticket" || v === "request_refund_review";
const schedule = (v: unknown): v is EventTicketSchedule => {
  if (!record(v) || !timestamp(v.startsAt) || !(v.endsAt === null || timestamp(v.endsAt))
    || (v.endsAt !== null && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) || typeof v.timeZone !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: v.timeZone }); return true; } catch { return false; }
};

export function parseEventTicketPolicy(value: unknown, eventId: string, purchaseId: string, buyerId: string): EventTicketPolicy | null {
  if (!record(value) || value.eventId !== eventId || value.purchaseId !== purchaseId || value.buyerId !== buyerId
    || !(value.purchaseIntentId === null || uuid(value.purchaseIntentId))
    || !(value.originalSchedule === null || schedule(value.originalSchedule))
    || !record(value.currentRevision) || !uuid(value.currentRevision.id) || !schedule(value.currentRevision)
    || !(value.acceptedRevisionId === null || uuid(value.acceptedRevisionId)) || typeof value.choiceRequired !== "boolean"
    || !Array.isArray(value.history) || value.history.some(row => !record(row) || !uuid(row.revisionId) || !choice(row.choice) || !timestamp(row.createdAt) || !schedule(row.schedule))
    || !(value.notice === null || (record(value.notice) && uuid(value.notice.id) && timestamp(value.notice.createdAt)))) return null;
  if (value.refundEligibility !== null && (!record(value.refundEligibility)
    || value.refundEligibility.eligibility !== "eligible" || value.refundEligibility.status !== "provider_review_required"
    || !timestamp(value.refundEligibility.createdAt) || !Array.isArray(value.refundEligibility.reasons)
    || value.refundEligibility.reasons.length === 0 || value.refundEligibility.reasons.some(reason =>
      !["event_canceled", "event_no_show", "material_schedule_change", "event_replay_unavailable"].includes(String(reason))))) return null;
  return value as EventTicketPolicy;
}

async function requestPolicy(eventId: string, purchaseId: string, response?: { revisionId: string; choice: EventScheduleChoice }): Promise<EventTicketPolicyResult> {
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  const unavailable: EventTicketPolicyResult = { status: "unavailable", policy: null,
    subjectUserId: authority?.userId ?? null, subjectSessionGeneration: authority?.sessionGeneration ?? null };
  if (!uuid(eventId) || !uuid(purchaseId) || !authority || authority.restoreOnly
    || (response && (!uuid(response.revisionId) || !choice(response.choice)))) return unavailable;
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (!sameAccountSessionAuthority(authority, subject.authority)) return unavailable;
    const args = { p_creator_event_id: eventId, p_purchase_id: purchaseId };
    const result = response
      ? await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "respond_creator_event_schedule_change", {
        ...args, p_expected_revision_id: response.revisionId, p_choice: response.choice,
      })
      : await invokeAccountBoundSupabaseMutationRpc<unknown>(subject, "read_my_creator_event_ticket_policy", args);
    if (result.error || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return unavailable;
    const policy = parseEventTicketPolicy(result.data, eventId, purchaseId, authority.userId);
    return policy ? { ...unavailable, status: "resolved", policy } : unavailable;
  } catch { return unavailable; }
}

export const readEventTicketPolicy = (eventId: string, purchaseId: string) => requestPolicy(eventId, purchaseId);
export const respondToEventSchedule = (eventId: string, purchaseId: string, revisionId: string, selectedChoice: EventScheduleChoice) =>
  requestPolicy(eventId, purchaseId, { revisionId, choice: selectedChoice });
