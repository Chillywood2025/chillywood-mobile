import { Linking, Platform } from "react-native";
import { captureAccountBoundSupabaseMutationSubject } from "./accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "./accountSessionAuthority";
import { assertIosExternalStorefront } from "./iosExternalAdmission";

/** Recheck the native storefront immediately before leaving the app. A delayed
 * SDK response must never open a link after navigation or an account change. */
export async function openCreatorExternalCheckout(url: string, canOpen: () => boolean): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "web") throw new Error("Use the native Google Play checkout flow.");
  const authority = getCurrentAccountSessionAuthoritySnapshot();
  if (!authority || authority.restoreOnly || !canOpen()) throw new Error("Checkout was closed.");
  const parsed = new URL(url);
  if (parsed.origin !== "https://checkout.stripe.com" || parsed.username || parsed.password || !/^\/(?:c\/)?pay\//u.test(parsed.pathname)) throw new Error("Checkout link could not be verified.");
  if (Platform.OS === "ios") {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (!sameAccountSessionAuthority(authority, subject.authority)) throw new Error("Account changed.");
    await assertIosExternalStorefront(subject);
  }
  if (!canOpen() || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) throw new Error("Checkout was closed.");
  await Linking.openURL(parsed.toString());
}
