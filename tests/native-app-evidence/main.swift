import Foundation

func check(_ value: [String: Any], _ status: String) {
  precondition(value["status"] as? String == status)
  for key in ["dispatchAllowed", "providerQualified", "iapQualified", "accountQualified", "exactBuildVerified"] {
    precondition(value[key] as? Bool == false)
  }
  precondition(value["evidenceScope"] as? String == "app_only")
}
for env in ["SANDBOX", "PRODUCTION", "XCODE"] {
  let value = AppTransactionEvidencePolicy.verified(environment: env, bundleID: "com.chillywood.mobile",
    signedAppVersion: "1.2", nativeBundleID: "com.chillywood.mobile", nativeVersion: "1.3", nativeBuild: "99")
  check(value, "verified")
  precondition(value["signedAppVersion"] as? String == "1.2")
  precondition(value["unsignedNativeBuild"] as? String == "99")
  precondition(value["environment"] as? String == env)
}
for (bundle, native) in [("other", "com.chillywood.mobile"), ("com.chillywood.mobile", "other")] {
  let value = AppTransactionEvidencePolicy.verified(environment: "SANDBOX", bundleID: bundle,
    signedAppVersion: "1", nativeBundleID: native, nativeVersion: nil, nativeBuild: nil)
  check(value, "wrong_bundle")
  precondition(value["bundleID"] is NSNull)
}
check(AppTransactionEvidencePolicy.verified(environment: "future", bundleID: "com.chillywood.mobile",
  signedAppVersion: "1", nativeBundleID: "com.chillywood.mobile", nativeVersion: nil, nativeBuild: nil), "unsupported_environment")
for status in ["unsupported_os", "unverified", "unavailable"] {
  let value = AppTransactionEvidencePolicy.result(status: status)
  check(value, status)
  precondition(value["environment"] is NSNull)
  precondition(value["signedAppVersion"] is NSNull)
}
check(AppTransactionEvidencePolicy.verified(environment: "SANDBOX", bundleID: "com.chillywood.mobile",
  signedAppVersion: "", nativeBundleID: "com.chillywood.mobile", nativeVersion: nil, nativeBuild: nil), "unavailable")
print("AppTransaction evidence policy: 10 cases passed (no StoreKit read executed)")
