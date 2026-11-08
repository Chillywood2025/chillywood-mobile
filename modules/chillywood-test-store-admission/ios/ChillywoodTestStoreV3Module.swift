import ExpoModulesCore
import RevenueCat
import Foundation
import CryptoKit

@MainActor
private final class TestStoreV3Runtime {
  private static var instance: TestStoreV3Runtime?
  let config: [String: String]
  let policy: TestStoreV3Policy
  struct Prepared {
    let customer: [String: Any], allocation: [String: Any], session: String, fingerprint: String
    let package: RevenueCat.Package
  }
  private var packages: [String: Prepared] = [:]
  static func current() throws -> TestStoreV3Runtime {
    if let instance = instance { return instance }
    let next = try TestStoreV3Runtime(); instance = next; return next
  }
  private init() throws {
    guard let admitted = TestStoreV3Contract.build(Bundle.main.bundleIdentifier,
      Bundle.main.object(forInfoDictionaryKey: "SCV3TestStoreConfiguration") as? [String: String] ?? [:]) else { throw TestStoreV3Error.unavailable }
    config = admitted
    var directory = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("isolated-test-store-native-v3", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var resource = URLResourceValues(); resource.isExcludedFromBackup = true; try directory.setResourceValues(resource)
    let file = directory.appendingPathComponent("ownership.json")
    let read: () throws -> [String: String]? = {
      if !FileManager.default.fileExists(atPath: file.path) { return nil }
      let data = try Data(contentsOf: file)
      try TestStoreV3Policy.require(data.count <= 32_100_000)
      guard let value = try JSONSerialization.jsonObject(with: data) as? [String: String] else { throw TestStoreV3Error.unavailable }; return value
    }
    if try read() == nil {
      // Presence-only veto for the pinned SDK's current/legacy caches. Never
      // adopt, alter or clear a cached identity when our owner is missing.
      let stores = [UserDefaults.standard, UserDefaults(suiteName: "com.revenuecat.user_defaults")].compactMap { $0 }
      try TestStoreV3Policy.require(!Purchases.isConfigured && !stores.contains { store in
        store.dictionaryRepresentation().keys.contains { $0.hasPrefix("com.revenuecat.") }
      })
    }
    policy = try TestStoreV3Policy(load: read, commit: { snapshot in
      let data = try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys])
      try TestStoreV3Policy.require(data.count <= 32_100_000)
      try data.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
      let handle = try FileHandle(forWritingTo: file); try handle.synchronize(); try handle.close()
    })
  }
  func inspect() throws -> [String: Any] {
    let customer: Any = policy.owner.isEmpty ? NSNull() : try TestStoreV3Contract.customer(policy.owner, config, policy.installationId)
    return ["protocol": "isolated-test-store-native-v3", "installationId": policy.installationId, "configurationDigest": config["configId"]!,
      "customer": customer, "processRetired": policy.retired, "activeInvocationId": policy.active.isEmpty ? NSNull() : policy.active]
  }
  func owns(_ customer: [String: Any], _ session: String) throws {
    try policy.current(session)
    try TestStoreV3Policy.require(try policy.owner == TestStoreV3Contract.json(customer))
    try TestStoreV3Policy.require(Purchases.isConfigured && Purchases.shared.appUserID == customer["providerAppUserId"] as? String)
  }
  func bind(_ customerJson: String, _ session: String) throws -> [String: Any] {
    let customer = try TestStoreV3Contract.customer(customerJson, config, policy.installationId)
    try policy.bind(ownerDocument: TestStoreV3Contract.json(customer), capturedSession: session, alreadyConfigured: { Purchases.isConfigured }, configure: {
      let stores = [UserDefaults.standard, UserDefaults(suiteName: "com.revenuecat.user_defaults")].compactMap { $0 }
      var identities: [String] = []; var footprint = false
      for store in stores {
        footprint = footprint || store.dictionaryRepresentation().keys.contains { $0.hasPrefix("com.revenuecat.") }
        for key in ["com.revenuecat.userdefaults.appUserID", "com.revenuecat.userdefaults.appUserID.new"] {
          if let value = store.object(forKey: key) { guard let value = value as? String else { throw TestStoreV3Error.unavailable }; identities.append(value) }
        }
      }
      try TestStoreV3Policy.require(TestStoreV3Policy.cacheMatches(expected: customer["providerAppUserId"] as! String, footprint: footprint, identities: identities))
      Purchases.configure(withAPIKey: self.config["publicSdkKey"]!, appUserID: customer["providerAppUserId"] as? String)
    })
    try owns(customer, session); return try inspect()
  }
  private func verify(_ package: RevenueCat.Package, _ allocation: [String: Any]) throws {
    let registration = allocation["registration"] as! [String: Any], quote = allocation["quote"] as! [String: Any]
    let amount = try TestStoreV3Contract.integer(quote["amountMinor"])
    try TestStoreV3Policy.require(package.identifier == registration["packageIdentifier"] as? String
      && package.presentedOfferingContext.offeringIdentifier == registration["offeringIdentifier"] as? String
      && package.storeProduct.productIdentifier == allocation["productId"] as? String
      && package.storeProduct.productType == .consumable && package.storeProduct.subscriptionPeriod == nil
      && package.storeProduct.currencyCode == "USD" && package.storeProduct.price == Decimal(amount) / 100)
  }
  func prepare(_ customerJson: String, _ allocationJson: String, _ session: String) async throws -> [String: Any] {
    let customer = try TestStoreV3Contract.customer(customerJson, config, policy.installationId)
    let allocation = try TestStoreV3Contract.allocation(allocationJson, customer); try owns(customer, session)
    try TestStoreV3Policy.require(try TestStoreV3Contract.date(allocation["acceptPurchaseUntil"]) > Date())
    let dispatch = allocation["dispatchId"] as! String, registration = allocation["registration"] as! [String: Any]
    let record: [String: Any] = ["customer": customer, "allocation": allocation, "sessionId": session,
      "invocation": try TestStoreV3Contract.invocation(customer, allocation, session)]
    let document = try TestStoreV3Contract.json(record)
    let fingerprint = SHA256.hash(data: Data(document.utf8)).map { String(format: "%02x", $0) }.joined()
    let lookup = try policy.beginLookup(dispatchId: dispatch, capturedSession: session)
    var persistenceStarted = false
    do {
      // A completed read-only cache miss releases only this lookup mutex. No
      // purchase handle or claim exists yet, and no same-SKU fallback is used.
      let customerInfo = try await Purchases.shared.customerInfo(); try owns(customer, session)
      try TestStoreV3Policy.require(customerInfo.originalAppUserId == customer["providerAppUserId"] as? String)
      let offerings = try await Purchases.shared.offerings(); try owns(customer, session)
      guard let offering = offerings.all[registration["offeringIdentifier"] as! String],
        offering.identifier == registration["offeringIdentifier"] as? String else { throw TestStoreV3Error.unavailable }
      let matches = offering.availablePackages.filter { $0.identifier == registration["packageIdentifier"] as? String }
      try TestStoreV3Policy.require(matches.count == 1); let package = matches[0]; try verify(package, allocation)
      try TestStoreV3Policy.require(try TestStoreV3Contract.date(allocation["acceptPurchaseUntil"]) > Date())
      persistenceStarted = true
      let handle = try policy.reserveAfterLookup(token: lookup, dispatchId: dispatch, capturedSession: session, fingerprint: fingerprint, document: document)
      packages[handle] = Prepared(customer: customer, allocation: allocation, session: session, fingerprint: fingerprint, package: package)
      return ["status": "prepared", "handleId": handle, "invocation": record["invocation"]!]
    } catch {
      if !persistenceStarted {
        try policy.endLookup(lookup)
        return ["status": "package_unavailable", "handleId": NSNull(), "invocation": NSNull()]
      }
      throw error
    }
  }
  func purchase(_ handle: String, _ claimJson: String) async throws -> [String: Any] {
    guard let prepared = packages[handle] else { throw TestStoreV3Error.unavailable }
    try owns(prepared.customer, prepared.session); try verify(prepared.package, prepared.allocation)
    let claim = try TestStoreV3Contract.object(claimJson)
    try TestStoreV3Contract.keys(claim, ["protocol", "command", "requestId", "actor", "generation", "environment", "result"])
    guard let actor = claim["actor"] as? [String: Any], let result = claim["result"] as? [String: Any] else { throw TestStoreV3Error.unavailable }
    try TestStoreV3Contract.keys(actor, ["userId", "sessionId"])
    try TestStoreV3Contract.keys(result, ["status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"])
    _ = try TestStoreV3Contract.id(claim["requestId"])
    try TestStoreV3Policy.require(claim["protocol"] as? String == "isolated-test-store-v3" && claim["command"] as? String == "claim"
      && claim["environment"] as? String == "sandbox" && (try TestStoreV3Contract.integer(claim["generation"])) == 1
      && actor["userId"] as? String == prepared.customer["buyerId"] as? String && actor["sessionId"] as? String == prepared.session
      && result["status"] as? String == "dispatch_claimed" && (try TestStoreV3Contract.boolean(result["dispatchAllowed"]))
      && !(try TestStoreV3Contract.boolean(result["retryProviderMutation"])) && !(try TestStoreV3Contract.boolean(result["grantsAccess"]))
      && (try TestStoreV3Contract.boolean(result["notPayable"])) && result["receipt"] is NSNull)
    guard let claimCustomer = result["customer"] as? [String: Any], let claimAllocation = result["allocation"] as? [String: Any] else { throw TestStoreV3Error.unavailable }
    try TestStoreV3Policy.require(try TestStoreV3Contract.json(claimCustomer) == TestStoreV3Contract.json(prepared.customer)
      && TestStoreV3Contract.json(claimAllocation) == TestStoreV3Contract.json(prepared.allocation))
    let expiry = try TestStoreV3Contract.date(result["authorityValidUntil"])
    guard let reservation = result["reservation"] as? [String: Any] else { throw TestStoreV3Error.unavailable }
    try TestStoreV3Contract.keys(reservation, ["revision", "activeAllocationId"])
    _ = try TestStoreV3Contract.integer(reservation["revision"]); _ = try TestStoreV3Contract.text(result["reason"])
    try TestStoreV3Policy.require(reservation["activeAllocationId"] as? String == prepared.allocation["id"] as? String
      && expiry <= (try TestStoreV3Contract.date(prepared.allocation["acceptPurchaseUntil"]))
      && expiry > Date() && expiry.timeIntervalSinceNow <= 5)
    let dispatch = prepared.allocation["dispatchId"] as! String
    guard let stored = try policy.read(dispatch) else { throw TestStoreV3Error.unavailable }
    var record = try TestStoreV3Contract.object(stored); var invocation = record["invocation"] as! [String: Any]
    invocation["state"] = "invoking"; record["invocation"] = invocation
    try policy.invoke(ticket: handle, dispatchId: dispatch, capturedSession: prepared.session,
      fingerprint: prepared.fingerprint, invokingDocument: TestStoreV3Contract.json(record))
    packages.removeValue(forKey: handle)
    try owns(prepared.customer, prepared.session)
    try TestStoreV3Policy.require(expiry > Date() && (try TestStoreV3Contract.date(prepared.allocation["acceptPurchaseUntil"])) > Date())
    // This is the SAME SDK-returned Package verified above. Neither the hybrid
    // bridge nor a provider identifier relookup can substitute its product.
    return try await withCheckedThrowingContinuation { continuation in
      Purchases.shared.purchase(package: prepared.package) { transaction, _, error, userCancelled in
        Task { @MainActor in
          do {
            var completed = invocation
            let hint = transaction?.transactionIdentifier
            let matches = transaction?.productIdentifier == prepared.allocation["productId"] as? String
            completed["state"] = "completed"
            completed["outcome"] = userCancelled ? "sdk_cancelled" : (error == nil && matches ? "sdk_success" : "sdk_unknown")
            completed["transactionHint"] = matches && (hint?.utf8.count ?? 0) > 0 && (hint?.utf8.count ?? 201) <= 200 ? hint! : NSNull()
            completed["completedAt"] = TestStoreV3Contract.now(); var done = record; done["invocation"] = completed
            try self.policy.complete(dispatchId: dispatch, completedDocument: TestStoreV3Contract.json(done))
            continuation.resume(returning: completed)
          } catch { continuation.resume(throwing: TestStoreV3Error.unavailable) }
        }
      }
    }
  }
  func read(_ dispatch: String) throws -> [String: Any]? {
    guard let stored = try policy.read(dispatch) else { return nil }
    let record = try TestStoreV3Contract.object(stored)
    try TestStoreV3Contract.keys(record, ["customer", "allocation", "sessionId", "invocation"] + (record["preparedClosure"] == nil ? [] : ["preparedClosure"]))
    guard let rawCustomer = record["customer"] as? [String: Any], let rawAllocation = record["allocation"] as? [String: Any] else { throw TestStoreV3Error.unavailable }
    let customer = try TestStoreV3Contract.customer(TestStoreV3Contract.json(rawCustomer), config, policy.installationId)
    let allocation = try TestStoreV3Contract.allocation(TestStoreV3Contract.json(rawAllocation), customer)
    try TestStoreV3Policy.require(try TestStoreV3Contract.json(customer) == policy.owner && allocation["dispatchId"] as? String == dispatch)
    guard var invocation = record["invocation"] as? [String: Any] else { throw TestStoreV3Error.unavailable }
    var expected = try TestStoreV3Contract.invocation(customer, allocation, TestStoreV3Contract.id(record["sessionId"]))
    try TestStoreV3Contract.keys(invocation, Array(expected.keys))
    guard let state = invocation["state"] as? String, ["prepared", "invoking", "completed", "unknown"].contains(state) else { throw TestStoreV3Error.unavailable }
    if state == "completed" {
      guard let outcome = invocation["outcome"] as? String, ["sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"].contains(outcome) else { throw TestStoreV3Error.unavailable }
      if !(invocation["transactionHint"] is NSNull) { _ = try TestStoreV3Contract.text(invocation["transactionHint"]) }
      _ = try TestStoreV3Contract.date(invocation["completedAt"])
    } else { try TestStoreV3Policy.require(invocation["outcome"] is NSNull && invocation["transactionHint"] is NSNull && invocation["completedAt"] is NSNull) }
    for key in ["state", "outcome", "transactionHint", "completedAt"] { expected[key] = invocation[key] }
    try TestStoreV3Policy.require(try TestStoreV3Contract.json(expected) == TestStoreV3Contract.json(invocation))
    if let closure = record["preparedClosure"] {
      try TestStoreV3Policy.require(policy.active != dispatch && !policy.isNativeInvocation(dispatch))
      guard let closure = closure as? [String: Any] else { throw TestStoreV3Error.unavailable }
      return try TestStoreV3Contract.validatePreparedClosure(closure, invocation)
    }
    if invocation["state"] as? String == "invoking" && !policy.isNativeInvocation(dispatch) { invocation["state"] = "unknown" }
    return invocation
  }
  func closePrepared(_ customerJson: String, _ allocationJson: String, _ session: String) throws -> [String: Any] {
    let customer = try TestStoreV3Contract.customer(customerJson, config, policy.installationId)
    let allocation = try TestStoreV3Contract.allocation(allocationJson, customer); try owns(customer, session)
    let dispatch = allocation["dispatchId"] as! String
    guard let prior = try read(dispatch), let raw = try policy.read(dispatch) else { throw TestStoreV3Error.unavailable }
    var record = try TestStoreV3Contract.object(raw)
    try TestStoreV3Policy.require(try TestStoreV3Contract.json(record["customer"]!) == TestStoreV3Contract.json(customer)
      && TestStoreV3Contract.json(record["allocation"]!) == TestStoreV3Contract.json(allocation))
    if record["preparedClosure"] != nil { return prior }
    guard let invocation = record["invocation"] as? [String: Any], invocation["state"] as? String == "prepared" else { throw TestStoreV3Error.unavailable }
    record["preparedClosure"] = try TestStoreV3Contract.preparedClosure(invocation, TestStoreV3Contract.now())
    packages.removeAll() // A failed persistence acknowledgement cannot leave a usable JS handle.
    try policy.closePrepared(dispatchId: dispatch, capturedSession: session, preparedDocument: raw, closedDocument: TestStoreV3Contract.json(record))
    guard let result = try read(dispatch) else { throw TestStoreV3Error.unavailable }; return result
  }
  func retire(_ session: String) { policy.retire(session); packages.removeAll() }
}

public final class ChillywoodTestStoreV3Module: Module {
  public func definition() -> ModuleDefinition {
    Name("ChillywoodTestStoreV3")
    Constants {
      let config = Bundle.main.object(forInfoDictionaryKey: "SCV3TestStoreConfiguration") as? [String: String] ?? [:]
      let build = TestStoreV3Contract.build(Bundle.main.bundleIdentifier, config)
      var result: [String: Any] = ["isolatedTestStoreV3Flavor": Bundle.main.bundleIdentifier == TestStoreV3Policy.applicationId
        || Bundle.main.object(forInfoDictionaryKey: "SCV3TestStoreFlavor") as? Bool == true]
      if let build = build { var value: [String: Any] = build; value["nativeDebug"] = true; result["build"] = value }
      else { result["build"] = NSNull() }; return result
    }
    AsyncFunction("inspectInstallation") { () async throws -> [String: Any] in try await MainActor.run { try TestStoreV3Runtime.current().inspect() } }
    AsyncFunction("bindCustomer") { (customer: String, session: String) async throws -> [String: Any] in
      try await MainActor.run { try TestStoreV3Runtime.current().bind(customer, session) }
    }
    AsyncFunction("preparePackage") { (customer: String, allocation: String, session: String) async throws -> [String: Any] in
      try await TestStoreV3Runtime.current().prepare(customer, allocation, session)
    }
    AsyncFunction("purchasePrepared") { (handle: String, claim: String) async throws -> [String: Any] in
      try await TestStoreV3Runtime.current().purchase(handle, claim)
    }
    AsyncFunction("readInvocation") { (dispatch: String) async throws -> [String: Any]? in try await MainActor.run { try TestStoreV3Runtime.current().read(dispatch) } }
    AsyncFunction("closePrepared") { (customer: String, allocation: String, session: String) async throws -> [String: Any] in
      try await MainActor.run { try TestStoreV3Runtime.current().closePrepared(customer, allocation, session) }
    }
    AsyncFunction("retireSession") { (session: String) async throws in try await MainActor.run { try TestStoreV3Runtime.current().retire(session) } }
  }
}
