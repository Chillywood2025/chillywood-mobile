import { AppState, Platform } from "react-native";
import * as Application from "expo-application";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { isIsolatedTestStoreFlavor } from "./isolatedTestStoreBuild";
import { isIsolatedTestStoreV2Flavor } from "./isolatedTestStoreV2Build";
import { isIsolatedTestStoreV3Flavor } from "./isolatedTestStoreV3Build";
import { NativeSandboxQuoteError } from "./nativeStoreSandboxQuote";

/** Local lifecycle/build restriction only. Never Google-account, test-instrument,
 * no-charge or signed-build proof. The human owns confirmation in Google's UI. */
export function captureNativePlayTestSheetContext(authority: AccountSessionAuthorityBinding) {
  const expected = Object.freeze({ ...authority });
  const nativeBuild = Application.nativeBuildVersion, nativeVersion = Application.nativeApplicationVersion;
  const scalar = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128 && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
  let retired = false;
  const assertCurrent = () => {
    if (retired || Platform.OS !== "android" || AppState.currentState !== "active" || Application.applicationId !== "com.chillywood.mobile"
      || !scalar(nativeBuild) || !scalar(nativeVersion) || Application.nativeBuildVersion !== nativeBuild || Application.nativeApplicationVersion !== nativeVersion
      || expected.state !== "ACTIVE" || expected.restoreOnly || expected.accountId !== expected.userId
      || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())
      || isIsolatedTestStoreFlavor() || isIsolatedTestStoreV2Flavor() || isIsolatedTestStoreV3Flavor()) throw new NativeSandboxQuoteError("outcome_unknown");
  };
  assertCurrent();
  const subscription = AppState.addEventListener("change", state => { if (state !== "active") retired = true; });
  return Object.freeze({ nativeBuild: nativeBuild!, nativeVersion: nativeVersion!, automaticNoChargeProof: false as const,
    assertCurrent, dispose: () => { retired = true; subscription.remove(); } });
}
