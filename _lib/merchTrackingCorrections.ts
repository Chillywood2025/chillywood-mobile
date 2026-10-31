import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export type TrackingCorrection = { id: string; orderId: string; carrier: string; trackingNumber: string; note: string; status: "pending_review" | "declined_held" | "approved" | "superseded"; reviewNote?: string };
export type TrackingCorrectionPage = { requests: TrackingCorrection[]; nextCursor: string | null };
const failure = "The correction outcome could not be confirmed. Retry the same request, then refresh current tracking. This is not confirmation of delivery or released earnings.";
const errors: Record<string, string> = {
  merch_correction_unavailable: "Correction review is unavailable for this order or account. Sign in again if needed.",
  merch_correction_invalid: "Choose a different valid carrier/tracking number and explain the correction.",
  merch_correction_not_available: "Only paid, tracked sandbox orders with saved tracking can request a correction.",
  merch_correction_identity_unavailable: "That tracking identity is already assigned. Check the carrier and number.",
  merch_correction_pending: "This order already has a pending correction. Refresh to see its status.",
  merch_correction_request_conflict: "This request does not match the saved request. Refresh before continuing.",
  merch_correction_already_reviewed: "This request was already reviewed. Refresh to see the decision.",
  merch_correction_request_limit: "This order has reached the correction request limit. Contact support; existing verification holds remain.",
  merch_correction_manual_review_required: "Previously verified delivery or conflicting shipping details require further review. Tracking and the return clock have not changed.",
};
export class TrackingCorrectionRejected extends Error {}
export const trackingCorrectionError = (error: unknown): string => error instanceof TrackingCorrectionRejected ? error.message : failure;
export function parseTrackingCorrections(value: unknown): TrackingCorrectionPage {
  if (!value || typeof value !== "object") throw new Error(failure);
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.requests) || row.requests.length > 100) throw new Error(failure);
  const requests = row.requests.map(item => {
    if (!item || typeof item !== "object" || item.financialAuthority !== false || !["pending_review", "declined_held", "approved", "superseded"].includes(item.status)
      || item.replacementApplied !== (item.status === "approved")) throw new Error(failure);
    for (const key of ["id", "orderId", "carrier", "trackingNumber", "note"]) if (typeof item[key] !== "string" || item[key].length > 2000) throw new Error(failure);
    if (item.reviewNote != null && (typeof item.reviewNote !== "string" || item.reviewNote.length > 2000)) throw new Error(failure);
    return { id: item.id, orderId: item.orderId, carrier: item.carrier, trackingNumber: item.trackingNumber, note: item.note, status: item.status, reviewNote: item.reviewNote ?? undefined } as TrackingCorrection;
  });
  if (row.nextCursor != null && typeof row.nextCursor !== "string") throw new Error(failure);
  return { requests, nextCursor: typeof row.nextCursor === "string" ? row.nextCursor : null };
}
async function rpc(name: string, args: Record<string, unknown>): Promise<TrackingCorrectionPage> {
  const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>(name, args);
  if (result.error) {
    const message = result.error.message ?? "";
    const code = Object.keys(errors).find(key => message.includes(key));
    if (code && result.error.code === "P0001" && !["merch_correction_unavailable", "merch_correction_request_conflict"].includes(code)) throw new TrackingCorrectionRejected(errors[code]);
    throw new Error(failure);
  }
  return parseTrackingCorrections(result.data);
}
export const readTrackingCorrections = (orderId: string) => rpc("read_merch_tracking_corrections", { p_order_id: orderId });
export const readTrackingCorrectionQueue = (cursor: string | null) => rpc("list_merch_tracking_correction_queue", { p_after: cursor, p_limit: 25 });
export const requestTrackingCorrection = (orderId: string, requestId: string, carrier: string, trackingNumber: string, note: string) => rpc("request_merch_tracking_correction", { p_order_id: orderId, p_request_id: requestId, p_carrier: carrier, p_tracking_number: trackingNumber.trim().toUpperCase(), p_note: note.trim() });
export const declineTrackingCorrection = (correctionId: string, requestId: string, note: string) => rpc("decline_merch_tracking_correction", { p_correction_id: correctionId, p_request_id: requestId, p_note: note.trim() });
export const approveTrackingCorrection = (correctionId: string, requestId: string, note: string) => rpc("approve_merch_tracking_correction", { p_correction_id: correctionId, p_request_id: requestId, p_note: note.trim() });
