import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export type MerchCaseKind = "return" | "non_delivery";
export type MerchCaseAction = "creator_response" | "buyer_response" | "escalate" | "buyer_close" | "staff_resolve";
export type MerchReturnCase = {
  id: string; orderId: string; kind: MerchCaseKind; status: "open" | "escalated" | "closed"; createdAt: string;
  events: { id: string; action: string; actorRole: string; note: string; createdAt: string }[];
};
export const MERCH_CASE_ERROR = "We couldn't confirm the case update. Refresh cases or retry the same request. A request does not issue a refund.";
export const MERCH_CASE_REJECTED = "The case update was rejected. Refresh cases and check the details, return deadline, and your permissions before trying again. No refund was issued.";
export class MerchCaseRejectedError extends Error {
  constructor() { super(MERCH_CASE_REJECTED); this.name = "MerchCaseRejectedError"; }
}
function isDefinitiveCaseRejection(name: string, error: { code?: string; message?: string }) {
  if (!["submit_merch_return_case", "respond_merch_return_case"].includes(name)) return false;
  // Only exact atomic SQL rejections permit a new operation. Timeouts, unknown
  // errors, malformed responses and request conflicts retain the original UUID.
  // Permission rejection precedes idempotency readback and cannot disprove an
  // earlier uncertain attempt, so even a known 42501 retains the frozen request.
  return error.code === "P0001" && ["merch_case_request_invalid", "merch_case_verified_payment_required", "merch_case_return_window_unavailable", "merch_case_already_closed"].includes(error.message ?? "");
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 2000) => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error();
  return value;
};
function parseCase(value: unknown): MerchReturnCase {
  const row = record(value);
  if (!["return", "non_delivery"].includes(String(row.kind)) || !["open", "escalated", "closed"].includes(String(row.status)) || !Array.isArray(row.events)) throw new Error();
  return { id: text(row.id, 80), orderId: text(row.orderId, 80), kind: row.kind as MerchCaseKind, status: row.status as MerchReturnCase["status"], createdAt: text(row.createdAt, 80),
    events: row.events.map(value => { const event = record(value); return { id: text(String(event.id), 80), action: text(event.action, 80), actorRole: text(event.actorRole, 80), note: text(event.note), createdAt: text(event.createdAt, 80) }; }) };
}
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>(name, args);
    if (result.error && isDefinitiveCaseRejection(name, result.error)) throw new MerchCaseRejectedError();
    if (result.error || result.data == null) throw new Error();
    return result.data;
  } catch (error) { if (error instanceof MerchCaseRejectedError) throw error; throw new Error(MERCH_CASE_ERROR); }
}
export async function readMerchReturnCases(orderId: string) {
  try {
    const data = record(await call("read_merch_return_cases", { p_order_id: orderId }));
    if (!Array.isArray(data.cases) || typeof data.canManage !== "boolean") throw new Error();
    const cases = data.cases.map(parseCase);
    if (cases.some(item => item.orderId !== orderId)) throw new Error();
    return { cases, canManage: data.canManage };
  } catch { throw new Error(MERCH_CASE_ERROR); }
}
export async function submitMerchReturnCase(orderId: string, requestId: string, kind: MerchCaseKind, note: string) {
  await call("submit_merch_return_case", { p_order_id: orderId, p_request_id: requestId, p_kind: kind, p_note: note });
}
export async function readMerchReturnReviewCases() {
  try {
    const data = record(await call("list_merch_return_review_cases", { p_limit: 50 }));
    if (data.canManage !== true || !Array.isArray(data.cases)) throw new Error();
    return data.cases.map(parseCase);
  } catch { throw new Error("Staff merch review is unavailable for this account or session."); }
}
export async function respondMerchReturnCase(caseId: string, requestId: string, action: MerchCaseAction, note: string) {
  await call("respond_merch_return_case", { p_case_id: caseId, p_request_id: requestId, p_action: action, p_note: note });
}

export async function canReviewMerchReturnCases(): Promise<boolean> {
  try {
    const results = await Promise.all(["admin.support.manage", "admin.refund_status.record"].map(p_permission_key =>
      runCurrentAccountBoundSupabaseMutationRpc<unknown>("has_platform_permission", { p_permission_key })));
    return results.every(result => !result.error && result.data === true);
  } catch { return false; }
}

export type MerchReturnQueuePage = { cases: MerchReturnCase[]; totalCount: number; nextCursor: string | null };
export async function readMerchReturnQueue(role: "creator" | "buyer" | "staff", after: string | null = null): Promise<MerchReturnQueuePage> {
  const data = record(await call("list_merch_return_case_queue", { p_role: role, p_after: after, p_limit: 50 }));
  if (data.role !== role || !Array.isArray(data.cases) || data.cases.length > 50 || !Number.isSafeInteger(data.totalCount) || Number(data.totalCount) < 0
    || (data.nextCursor !== null && (typeof data.nextCursor !== "string" || !/^[0-9a-f-]{36}$/i.test(data.nextCursor)))) throw new Error(MERCH_CASE_ERROR);
  return { cases: data.cases.map(parseCase), totalCount: Number(data.totalCount), nextCursor: data.nextCursor as string | null };
}
