import Foundation
import StoreKit

enum AppTransactionEvidence {
  // Dormant explicit read: no refresh(), sign-in call, receipt export, or purchase.
  // shared may need network/authentication; absence of OS UI is NOT asserted.
  static func read() async -> [String: Any] {
    guard #available(iOS 16.0, *) else { return AppTransactionEvidencePolicy.result(status: "unsupported_os") }
    guard Bundle.main.bundleIdentifier == AppTransactionEvidencePolicy.expectedBundleID else { return AppTransactionEvidencePolicy.result(status: "wrong_bundle") }
    do {
      switch try await AppTransaction.shared {
      case .verified(let transaction):
        let environment: String
        switch transaction.environment {
        case .sandbox: environment = "SANDBOX"
        case .production: environment = "PRODUCTION"
        case .xcode: environment = "XCODE"
        default: environment = "UNKNOWN"
        }
        return AppTransactionEvidencePolicy.verified(environment: environment, bundleID: transaction.bundleID,
                        signedAppVersion: transaction.appVersion,
                        nativeBundleID: Bundle.main.bundleIdentifier,
                        nativeVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
                        nativeBuild: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
      case .unverified:
        return AppTransactionEvidencePolicy.result(status: "unverified")
      }
    } catch { return AppTransactionEvidencePolicy.result(status: "unavailable") }
  }
}
