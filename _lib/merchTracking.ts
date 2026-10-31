import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";

export type MerchTrackingCarrier = "usps" | "ups" | "fedex";
export type MerchTracking = {
  assigned: boolean;
  carrier?: string;
  trackingNumber?: string;
  status?: string;
  confidence?: string;
  reviewReason?: string;
  deliveryAt?: string;
  providerConfigured: boolean;
  financialAuthority: false;
};

const errors: Record<string, string> = {
  merch_current_session_required: "Sign in again to view this order's tracking.",
  merch_tracking_order_unavailable: "Tracking is unavailable for this order or account.",
  merch_tracking_not_available: "Tracking can only be assigned to an eligible paid, tracked sandbox order.",
  merch_tracking_invalid: "Choose USPS, UPS or FedEx and enter a valid tracking number.",
  merch_tracking_immutable: "This order already has a tracking assignment. Refresh it; contact support for a correction.",
  merch_tracking_reused: "This tracking number is already assigned. Check the number or contact support.",
};
const fallback = "Tracking could not be loaded or saved. Refresh the order before trying again.";
export function merchTrackingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const key = Object.keys(errors).find(code => message.includes(code));
  // Never show raw database/provider errors, destination evidence or credentials.
  return key ? errors[key] : Object.values(errors).includes(message) ? message : fallback;
}

function parseTracking(value: unknown): MerchTracking {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(fallback);
  const row = value as Record<string, unknown>;
  if (typeof row.assigned !== "boolean" || typeof row.providerConfigured !== "boolean" || row.financialAuthority !== false) throw new Error(fallback);
  const text = (key: string, limit = 128) => typeof row[key] === "string" && row[key].length <= limit ? row[key] as string : undefined;
  const deliveryAt = text("deliveryAt");
  return {
    assigned: row.assigned, providerConfigured: row.providerConfigured, financialAuthority: false,
    carrier: text("carrier"), trackingNumber: text("trackingNumber"), status: text("status"),
    confidence: text("confidence"), reviewReason: text("reviewReason"),
    deliveryAt: deliveryAt && Number.isFinite(Date.parse(deliveryAt)) ? deliveryAt : undefined,
  };
}

async function trackingRpc(name: string, args: Record<string, unknown>): Promise<MerchTracking> {
  try {
    // Both reads and writes use frozen-token, exact-session readback protection.
    const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>(name, args);
    if (result.error) throw new Error(result.error.message);
    return parseTracking(result.data);
  } catch (error) { throw new Error(merchTrackingError(error)); }
}

export function readMerchTracking(orderId: string): Promise<MerchTracking> {
  return trackingRpc("get_merch_tracking", { p_order_id: orderId });
}

export function assignMerchTracking(input: { orderId: string; carrier: MerchTrackingCarrier; trackingNumber: string }): Promise<MerchTracking> {
  const trackingNumber = input.trackingNumber.trim().toUpperCase();
  if (!["usps", "ups", "fedex"].includes(input.carrier) || !/^[A-Z0-9]{6,64}$/.test(trackingNumber)) {
    return Promise.reject(new Error(errors.merch_tracking_invalid));
  }
  return trackingRpc("assign_merch_tracking", {
    p_order_id: input.orderId, p_carrier: input.carrier, p_tracking_number: trackingNumber,
  });
}
