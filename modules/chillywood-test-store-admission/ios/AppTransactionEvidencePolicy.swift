import Foundation

// App-level evidence only. This never qualifies an IAP, account, or SDK dispatch.
enum AppTransactionEvidencePolicy {
  static let expectedBundleID = "com.chillywood.mobile"

  static func result(status: String, environment: String? = nil,
                     bundleID: String? = nil, signedAppVersion: String? = nil,
                     nativeVersion: String? = nil, nativeBuild: String? = nil) -> [String: Any] {
    return [
      "schema": "app-transaction-evidence-v1", "status": status,
      "evidenceScope": "app_only", "environment": environment as Any? ?? NSNull(),
      "bundleID": bundleID as Any? ?? NSNull(),
      "signedAppVersion": signedAppVersion as Any? ?? NSNull(),
      "unsignedNativeVersion": nativeVersion as Any? ?? NSNull(),
      "unsignedNativeBuild": nativeBuild as Any? ?? NSNull(),
      "dispatchAllowed": false, "providerQualified": false,
      "iapQualified": false, "accountQualified": false, "exactBuildVerified": false
    ]
  }

  // Only called after StoreKit verification. Separated for deterministic native tests.
  static func verified(environment: String, bundleID: String, signedAppVersion: String,
                       nativeBundleID: String?, nativeVersion: String?, nativeBuild: String?) -> [String: Any] {
    guard bundleID == expectedBundleID, nativeBundleID == expectedBundleID else {
      return result(status: "wrong_bundle")
    }
    guard ["SANDBOX", "PRODUCTION", "XCODE"].contains(environment) else {
      return result(status: "unsupported_environment")
    }
    guard !signedAppVersion.isEmpty else { return result(status: "unavailable") }
    return result(status: "verified", environment: environment, bundleID: bundleID,
                  signedAppVersion: signedAppVersion, nativeVersion: nativeVersion, nativeBuild: nativeBuild)
  }

}
