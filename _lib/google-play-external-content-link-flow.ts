export type GooglePlayExternalLinkNative = {
  capabilities(): { apiVersion: number; program: string; billingLibraryVersion: string };
  prepare(): Promise<{ flowId: string; externalTransactionToken: string }>;
  launch(flowId: string, url: string): Promise<{ launched: boolean }>;
  cancel(flowId: string): Promise<void>;
};

export type GooglePlayExternalCheckoutInput = {
  google_play_external_transaction_token: string;
  google_play_external_link_api_version: 1;
};

export class GooglePlayExternalLinkError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "GooglePlayExternalLinkError"; }
}

export function googlePlayExternalLinkSupported(platform: string, native: GooglePlayExternalLinkNative | null): boolean {
  if (platform !== "android" || !native) return false;
  try {
    const capability = native.capabilities();
    return capability.apiVersion === 1 && capability.program === "external_content_link"
      && capability.billingLibraryVersion === "8.2.1";
  } catch { return false; }
}

/** One adapter per application process; the native coordinator independently rejects duplicates.
 * A successful launch is not a payment, entitlement, or account eligibility result. */
export function createGooglePlayExternalLinkFlow(platform: string, getNative: () => GooglePlayExternalLinkNative | null) {
  let busy = false;
  return async (createCheckout: (input: GooglePlayExternalCheckoutInput) => Promise<{ url: string }>) => {
    const native = getNative();
    if (!googlePlayExternalLinkSupported(platform, native) || !native) {
      throw new GooglePlayExternalLinkError("ECL_UPDATE_REQUIRED", "Update the Android app to use this checkout. This installed version cannot open Google Play external checkout.");
    }
    if (busy) throw new GooglePlayExternalLinkError("ECL_BUSY", "Checkout is already opening.");
    busy = true;
    let flowId: string | null = null;
    try {
      const prepared = await native.prepare();
      if (typeof prepared?.flowId === "string" && prepared.flowId) flowId = prepared.flowId;
      if (!flowId || typeof prepared.externalTransactionToken !== "string" || !prepared.externalTransactionToken) {
        throw new GooglePlayExternalLinkError("ECL_TOKEN_UNAVAILABLE", "Google Play could not prepare checkout.");
      }
      // The authenticated callback must bind this fresh token privately to its
      // exact session/quote/attempt. Never put it in URLs, logs or Stripe metadata.
      const checkout = await createCheckout({
        google_play_external_transaction_token: prepared.externalTransactionToken,
        google_play_external_link_api_version: 1,
      });
      const url = new URL(checkout.url);
      if (url.origin !== "https://checkout.stripe.com" || url.username || url.password
          || !/^\/(?:c\/)?pay\//u.test(url.pathname)) {
        throw new GooglePlayExternalLinkError("ECL_INVALID_CHECKOUT_URL", "Checkout link could not be verified.");
      }
      const result = await native.launch(flowId, url.toString());
      if (result?.launched !== true) throw new GooglePlayExternalLinkError("ECL_LAUNCH_FAILED", "Google Play did not open checkout.");
      return { launched: true as const };
    } finally {
      // Includes callback failure, account changes, timeout and Google dismissal.
      // This closes only our flow; a stale finally cannot cancel a newer flow.
      if (flowId) { try { await native.cancel(flowId); } catch { /* No fallback or private diagnostics. */ } }
      busy = false;
    }
  };
}

/** Eligibility for an explicit bid action. This does not open checkout, place a
 * charge, or reuse its token later for a winner's payment. Native owns the same
 * global single-flight coordinator as the checkout flow. */
export function createGooglePlayExternalEligibilityFlow(platform: string, getNative: () => GooglePlayExternalLinkNative | null) {
  let busy = false;
  return async <T>(checkEligibility: (input: GooglePlayExternalCheckoutInput) => Promise<T>): Promise<T> => {
    const native = getNative();
    if (!googlePlayExternalLinkSupported(platform, native) || !native) {
      throw new GooglePlayExternalLinkError("ECL_UPDATE_REQUIRED", "Update the Android app to check Google Play eligibility.");
    }
    if (busy) throw new GooglePlayExternalLinkError("ECL_BUSY", "Eligibility is already being checked.");
    busy = true;
    let flowId: string | null = null;
    try {
      const prepared = await native.prepare();
      if (typeof prepared?.flowId === "string" && prepared.flowId) flowId = prepared.flowId;
      if (!flowId || typeof prepared.externalTransactionToken !== "string" || !prepared.externalTransactionToken) {
        throw new GooglePlayExternalLinkError("ECL_TOKEN_UNAVAILABLE", "Google Play could not check eligibility.");
      }
      return await checkEligibility({ google_play_external_transaction_token: prepared.externalTransactionToken,
        google_play_external_link_api_version: 1 });
    } finally {
      if (flowId) { try { await native.cancel(flowId); } catch { /* Never launch a fallback. */ } }
      busy = false;
    }
  };
}
