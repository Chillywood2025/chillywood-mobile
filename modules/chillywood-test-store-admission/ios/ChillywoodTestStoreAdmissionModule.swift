import ExpoModulesCore
import RevenueCat

public final class ChillywoodTestStoreAdmissionModule: Module {
  private func nativeConfig() -> [String: String] {
    Bundle.main.object(forInfoDictionaryKey: "SCV1TestStoreConfiguration") as? [String: String] ?? [:]
  }
  public func definition() -> ModuleDefinition {
    Name("ChillywoodTestStoreAdmission")
    Constants {
      let build = TestStoreAdmissionPolicy.snapshot(applicationId: Bundle.main.bundleIdentifier, config: self.nativeConfig())
      let flavor = Bundle.main.bundleIdentifier == TestStoreAdmissionPolicy.applicationId
        || Bundle.main.object(forInfoDictionaryKey: "SCV1TestStoreFlavor") as? Bool == true
      var result: [String: Any] = ["isolatedTestStoreFlavor": flavor]
      if let build = build { var exposed: [String: Any] = build; exposed["nativeDebug"] = true; result["build"] = exposed }
      else { result["build"] = NSNull() }
      return result
    }
    AsyncFunction("configureTestStore") { (providerAppUserId: String) async throws -> [String: Any] in
      try await MainActor.run {
        let config = self.nativeConfig()
        let admitted = try TestStoreAdmissionPolicy.configure(applicationId: Bundle.main.bundleIdentifier, config: config,
          user: providerAppUserId, alreadyConfigured: { Purchases.isConfigured }, configure: {
            Purchases.configure(withAPIKey: config["publicSdkKey"]!, appUserID: providerAppUserId)
          })
        return ["configured": true, "configId": admitted["configId"]!, "providerAppUserId": providerAppUserId]
      }
    }
    AsyncFunction("ownsProviderIdentity") { (providerAppUserId: String) async -> Bool in
      await MainActor.run {
        TestStoreAdmissionPolicy.owns(user: providerAppUserId, currentIdentityMatches: {
          Purchases.isConfigured && Purchases.shared.appUserID == providerAppUserId
        })
      }
    }
  }
}
