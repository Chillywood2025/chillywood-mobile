import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import type { GooglePlayExternalCheckoutInput } from "./google-play-external-content-link-flow";

/** A short-lived server admission is not Google attestation or payment proof.
 * Only call after the native Billing SDK has prepared this explicit checkout. */
export async function admitGooglePlayExternalCheckout(
  subject: Awaited<ReturnType<typeof captureAccountBoundSupabaseMutationSubject>>,
  input: { feature: "creator_tip" | "event_auction" | "room_seat_auction"; creatorId: string; amountMinor: number; sourceId: string; capabilityId?: string },
  native: GooglePlayExternalCheckoutInput,
): Promise<string> {
  if (!sameAccountSessionAuthority(subject.authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Account changed before checkout.");
  const result = await invokeAccountBoundSupabaseMutationRpc<Record<string, unknown>>(subject, "admit_google_play_external_session", {
    p_feature: input.feature, p_creator_id: input.creatorId, p_amount_minor: input.amountMinor, p_source_id: input.sourceId,
    p_external_transaction_token: native.google_play_external_transaction_token, p_api_version: native.google_play_external_link_api_version,
    ...(input.capabilityId ? { p_capability_id: input.capabilityId } : {}),
  });
  const row = result.data;
  if (result.error || !row || typeof row.capabilityId !== "string"
    || (input.capabilityId !== undefined && row.capabilityId !== input.capabilityId)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.capabilityId)
    || typeof row.expiresAt !== "string" || !(Date.parse(row.expiresAt) > Date.now())
    || row.verification !== "native_sdk_observation_unverified" || row.financialAuthority !== false || row.accessGranted !== false
    || !sameAccountSessionAuthority(subject.authority, getCurrentAccountSessionAuthoritySnapshot())) {
    throw new Error("Google Play checkout is not available for this account and amount. No checkout was opened.");
  }
  return row.capabilityId;
}
