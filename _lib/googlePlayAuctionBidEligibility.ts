import { admitIosExternalCheckout } from "./iosExternalAdmission";
import { Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { admitGooglePlayExternalCheckout } from "./googlePlayExternalAdmission";
import { withGooglePlayExternalEligibility } from "./google-play-external-content-links";

export async function withGooglePlayAuctionBidEligibility<T>(
  input: { feature: "event_auction" | "room_seat_auction"; creatorId: string; sourceId: string; amountMinor: number },
  action: (capabilityId: string | null) => Promise<T>,
): Promise<T> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return action(null);
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly) throw new Error("Sign in before checking bid eligibility.");
  const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
  if (!sameAccountSessionAuthority(authority, subject.authority)) throw new Error("Account changed before bidding.");
  if (Platform.OS === "ios") {
    const capabilityId = await admitIosExternalCheckout(subject, input);
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Account changed before bidding.");
    return action(capabilityId);
  }
  return withGooglePlayExternalEligibility(async native => {
    const capabilityId = await admitGooglePlayExternalCheckout(subject, input, native);
    if (!sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Account changed before bidding.");
    return action(capabilityId);
  });
}
