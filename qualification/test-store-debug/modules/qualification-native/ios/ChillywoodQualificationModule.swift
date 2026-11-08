import ExpoModulesCore
import RevenueCat
import Foundation

@MainActor
private final class QualificationRuntime {
  private static var instance: QualificationRuntime?
  let config: [String: Any], raw: [String: String], policy: QualificationPolicy
  private struct Prepared { let record: [String: Any], scenario: [String: Any], fingerprint: String, package: RevenueCat.Package }
  private var prepared: [String: Prepared] = [:]
  static func current() throws -> QualificationRuntime { if let value = instance { return value }; let value = try QualificationRuntime(); instance = value; return value }
  private init() throws {
    raw = Bundle.main.object(forInfoDictionaryKey: "SCQQualificationConfiguration") as? [String: String] ?? [:]
    config = try QualificationContract.build(Bundle.main.bundleIdentifier, raw)
    var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("scq-native-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true; try directory.setResourceValues(attributes)
    let file = directory.appendingPathComponent("owner.json")
    let load: () throws -> [String: String]? = {
      if !FileManager.default.fileExists(atPath: file.path) { return nil }
      let bytes = try Data(contentsOf: file); try QualificationPolicy.require(bytes.count <= 1_100_000)
      guard let value = try JSONSerialization.jsonObject(with: bytes) as? [String: String] else { throw QualificationError.unavailable }; return value
    }
    if try load() == nil {
      let stores = [UserDefaults.standard, UserDefaults(suiteName: "com.revenuecat.user_defaults")].compactMap { $0 }
      try QualificationPolicy.require(!Purchases.isConfigured && !stores.contains { $0.dictionaryRepresentation().keys.contains { $0.hasPrefix("com.revenuecat.") } })
    }
    policy = try QualificationPolicy(load: load, commit: { value in
      let bytes = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]); try QualificationPolicy.require(bytes.count <= 1_100_000)
      try bytes.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
      let handle = try FileHandle(forWritingTo: file); try handle.synchronize(); try handle.close()
    })
  }
  private var run: String { config["runId"] as! String }
  private var uid: String { "scq_teststore_" + policy.installationId }
  private var scenarios: [[String: Any]] { config["scenarios"] as! [[String: Any]] }
  private func owner() throws -> String { try QualificationContract.json(["configurationDigest": raw["configurationDigest"]!, "providerAppUserId": uid, "runId": run]) }
  private func owns() throws { try policy.current(run); try QualificationPolicy.require(try policy.owner == owner()); try QualificationPolicy.require(Purchases.isConfigured && Purchases.shared.appUserID == uid) }
  func inspect() throws -> [String: Any] {
    let records = try policy.records().map { stored -> [String: Any] in
      var record = try QualificationContract.object(stored)
      if record["state"] as? String == "invoking", let id = record["invocationId"] as? String, !policy.isNativeInvocation(id) { record["state"] = "unknown" }
      return record
    }
    return ["protocol": "test-store-qualification-native-v1", "configurationDigest": raw["configurationDigest"]!, "installationId": policy.installationId,
      "providerAppUserId": uid, "runId": run, "closed": policy.sealed, "configured": policy.configuredLocally,
      "activeInvocationId": policy.active.isEmpty ? NSNull() : policy.active, "scenarios": scenarios, "records": records]
  }
  func configure() throws {
    try policy.bind(ownerDocument: owner(), capturedSession: run, alreadyConfigured: { Purchases.isConfigured }, configure: {
      let stores = [UserDefaults.standard, UserDefaults(suiteName: "com.revenuecat.user_defaults")].compactMap { $0 }
      var identities: [String] = []; var footprint = false
      for store in stores {
        footprint = footprint || store.dictionaryRepresentation().keys.contains { $0.hasPrefix("com.revenuecat.") }
        for key in ["com.revenuecat.userdefaults.appUserID", "com.revenuecat.userdefaults.appUserID.new"] {
          if let value = store.object(forKey: key) { guard let value = value as? String else { throw QualificationError.unavailable }; identities.append(value) }
        }
      }
      try QualificationPolicy.require(QualificationPolicy.cacheMatches(expected: self.uid, footprint: footprint, identities: identities))
      Purchases.configure(withAPIKey: self.raw["publicSdkKey"]!, appUserID: self.uid)
    }); try owns()
  }
  private func verify(_ package: RevenueCat.Package, _ scenario: [String: Any]) throws {
    try QualificationPolicy.require(package.identifier == scenario["packageIdentifier"] as? String && package.presentedOfferingContext.offeringIdentifier == scenario["offeringIdentifier"] as? String
      && package.storeProduct.productIdentifier == scenario["productId"] as? String && package.storeProduct.productType == .consumable
      && package.storeProduct.subscriptionPeriod == nil && package.storeProduct.currencyCode == "USD"
      && package.storeProduct.price == Decimal(try QualificationContract.integer(scenario["amountMinor"])) / 100)
  }
  func prepare(_ scenarioId: String) async throws -> [String: Any] {
    try owns(); guard let scenario = scenarios.first(where: { $0["id"] as? String == scenarioId }) else { throw QualificationError.unavailable }
    let invocationId = UUID().uuidString.lowercased(), lookup = try policy.beginLookup(dispatchId: invocationId, capturedSession: run)
    var persistenceStarted = false
    do {
      let customer = try await Purchases.shared.customerInfo(); try owns(); try QualificationPolicy.require(customer.originalAppUserId == uid)
      let offerings = try await Purchases.shared.offerings(); try owns()
      guard let offering = offerings.all[scenario["offeringIdentifier"] as! String], offering.identifier == scenario["offeringIdentifier"] as? String else { throw QualificationError.unavailable }
      let matches = offering.availablePackages.filter { $0.identifier == scenario["packageIdentifier"] as? String }
      try QualificationPolicy.require(matches.count == 1); let package = matches[0]; try verify(package, scenario)
      var record: [String: Any] = ["protocol": "test-store-qualification-record-v1", "invocationId": invocationId, "scenarioId": scenarioId, "runId": run,
        "configurationDigest": raw["configurationDigest"]!, "providerAppUserId": uid, "state": "prepared", "outcome": NSNull(), "createdAt": QualificationContract.now(), "completedAt": NSNull()]
      for key in ["offeringIdentifier", "packageIdentifier", "productId", "amountMinor", "currency"] { record[key] = scenario[key]! }
      let document = try QualificationContract.json(record), fingerprint = QualificationContract.hash(document); persistenceStarted = true
      let handle = try policy.reserveAfterLookup(token: lookup, dispatchId: invocationId, capturedSession: run, fingerprint: fingerprint, document: document)
      prepared[handle] = Prepared(record: record, scenario: scenario, fingerprint: fingerprint, package: package)
      return ["status": "prepared", "handleId": handle, "record": record]
    } catch {
      if !persistenceStarted { try policy.endLookup(lookup); return ["status": "package_unavailable", "handleId": NSNull(), "record": NSNull()] }
      throw error
    }
  }
  func purchase(_ handle: String) async throws -> [String: Any] {
    try owns(); guard let selected = prepared[handle] else { throw QualificationError.unavailable }; try verify(selected.package, selected.scenario)
    var invoking = selected.record; invoking["state"] = "invoking"; let invocationId = invoking["invocationId"] as! String
    try policy.invoke(ticket: handle, dispatchId: invocationId, capturedSession: run, fingerprint: selected.fingerprint, invokingDocument: QualificationContract.json(invoking)); prepared.removeValue(forKey: handle)
    try owns()
    return try await withCheckedThrowingContinuation { continuation in
      // The SDK-returned Package object is retained across inspection and this
      // explicit invocation. No Offering relookup or constructed Package occurs.
      Purchases.shared.purchase(package: selected.package) { transaction, _, error, cancelled in
        Task { @MainActor in
          do {
            var completed = invoking; completed["state"] = "completed"; completed["completedAt"] = QualificationContract.now()
            completed["outcome"] = cancelled ? "sdk_cancelled" : (error == nil && transaction?.productIdentifier == selected.scenario["productId"] as? String ? "sdk_success" : "sdk_unknown")
            try self.policy.complete(dispatchId: invocationId, completedDocument: QualificationContract.json(completed)); continuation.resume(returning: completed)
          } catch { continuation.resume(throwing: QualificationError.unavailable) }
        }
      }
    }
  }
  func seal() throws { try policy.seal(); prepared.removeAll() }
}

public final class ChillywoodQualificationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChillywoodQualification")
    AsyncFunction("inspect") { () async throws -> [String: Any] in try await MainActor.run { try QualificationRuntime.current().inspect() } }
    AsyncFunction("configure") { () async throws in try await MainActor.run { try QualificationRuntime.current().configure() } }
    AsyncFunction("prepare") { (scenarioId: String) async throws -> [String: Any] in try await QualificationRuntime.current().prepare(scenarioId) }
    AsyncFunction("purchase") { (handle: String) async throws -> [String: Any] in try await QualificationRuntime.current().purchase(handle) }
    AsyncFunction("seal") { () async throws in try await MainActor.run { try QualificationRuntime.current().seal() } }
  }
}
