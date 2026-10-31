import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import {
  createGooglePlayExternalLinkFlow,
  createGooglePlayExternalEligibilityFlow,
  googlePlayExternalLinkSupported,
  type GooglePlayExternalLinkNative,
} from "./google-play-external-content-link-flow";

function nativeModule(): GooglePlayExternalLinkNative | null {
  if (Platform.OS !== "android") return null;
  try { return requireOptionalNativeModule<GooglePlayExternalLinkNative>("ChillywoodExternalContentLinks"); }
  catch { return null; }
}

// This detects installed native code, not Play eligibility, enrollment, backend
// readiness, or cohort admission. Those are checked independently on every flow.
export const isGooglePlayExternalContentLinkSupported = () =>
  googlePlayExternalLinkSupported(Platform.OS, nativeModule());

export const withGooglePlayExternalContentLink = createGooglePlayExternalLinkFlow(Platform.OS, nativeModule);
export const withGooglePlayExternalEligibility = createGooglePlayExternalEligibilityFlow(Platform.OS, nativeModule);
export { GooglePlayExternalLinkError } from "./google-play-external-content-link-flow";
export type { GooglePlayExternalCheckoutInput } from "./google-play-external-content-link-flow";
