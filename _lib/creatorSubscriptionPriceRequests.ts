import { captureAccountBoundSupabaseMutationSubject, assertAccountBoundSupabaseMutationSubjectCurrent } from "./accountBoundSupabaseMutation";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
export type CreatorSubscriptionPriceRequest = { id: string; amountMinor: number; status: "pending_provisioning" | "approved" | "declined" | "cancelled"; createdAt: string };
export async function readCreatorSubscriptionPriceRequests(): Promise<CreatorSubscriptionPriceRequest[]> {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const query = new URLSearchParams({ select: "id,creator_id,amount_minor,currency,status,created_at", creator_id: `eq.${subject.authority.userId}`, order: "created_at.desc,id.desc", limit: "50" });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("Price request status timed out.")); }, 15_000); });
    const rows = await Promise.race([deadline, (async () => {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/creator_channel_subscription_price_requests?${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${subject.accessToken}`, Accept: "application/json" }, signal: controller.signal,
      });
      if (!response.ok) throw new Error("Price request status unavailable.");
      return await response.json();
    })()]);
    assertAccountBoundSupabaseMutationSubjectCurrent(subject);
    if (!Array.isArray(rows) || rows.length > 50) throw new Error("Invalid request status.");
    return rows.map(row => {
      if (!row || row.creator_id !== subject.authority.userId || row.currency !== "usd" || typeof row.id !== "string"
        || !Number.isSafeInteger(row.amount_minor) || row.amount_minor <= 0 || !["pending_provisioning", "approved", "declined", "cancelled"].includes(row.status)
        || typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new Error("Invalid request status.");
      return { id: row.id, amountMinor: row.amount_minor, status: row.status, createdAt: row.created_at };
    });
  } finally { clearTimeout(timeout); }
}
