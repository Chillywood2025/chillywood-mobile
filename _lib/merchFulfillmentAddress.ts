import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export type MerchFulfillmentAddress = { status: "available"; lines: string[] } | { status: "unavailable" | "review_required" };
export const MERCH_SHIPPING_ERROR = "Shipping details are unavailable for this order or account. Refresh the order or contact support.";

export async function readMerchFulfillmentAddress(orderId: string): Promise<MerchFulfillmentAddress> {
  try {
    // Frozen-token transport checks the exact account/session again on readback.
    const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>("get_merch_fulfillment_address", { p_order_id: orderId });
    if (result.error || !result.data || typeof result.data !== "object") throw new Error();
    const value = result.data as Record<string, unknown>;
    if (value.status === "unavailable" || value.status === "review_required") return { status: value.status };
    if (value.status !== "available" || !value.address || typeof value.address !== "object" || Array.isArray(value.address)) throw new Error();
    const address = value.address as Record<string, unknown>;
    const fields = ["name", "line1", "line2", "city", "state", "postal_code", "country"];
    const lines = fields.map(key => {
      const field = address[key];
      if (field == null && ["line2", "state"].includes(key)) return "";
      if (typeof field !== "string" || !field.trim() || field.length > 200 || /[\u0000-\u001f\u007f<>]/u.test(field)) throw new Error();
      return field;
    }).filter(Boolean);
    return { status: "available", lines };
  } catch {
    // Raw SQL/provider errors can contain private address evidence.
    throw new Error(MERCH_SHIPPING_ERROR);
  }
}
