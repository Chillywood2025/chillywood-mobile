import ExpoModulesCore
import RevenueCat
import DeviceCheck
import CryptoKit
import Foundation
import UIKit
import StoreKit

private enum PaidWitnessError: Error { case held }
private final class PaidWitnessNoRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor private final class PaidWitnessRuntime {
  static let shared = PaidWitnessRuntime()
  struct Prepared { let context: [String: String]; let product: StoreProduct; let keyId: String
    let preparationId: String; let monotonicStart: TimeInterval; let elapsedLimitMs: Int64; let authorization: String }
  private var prepared: [String: Prepared] = [:]
  private var entryReady: [String: Prepared] = [:]
  private enum EntryState { case prepared, authorizing, ready, checking, invoked }
  private var entryState: [String: EntryState] = [:]
  private var entryEpoch: [String: UUID] = [:]
  private var liveJournalAttempt: Set<String> = []
  private var owner: String?
  private var directory: URL {
    get throws {
      var url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
        appropriateFor: nil, create: true).appendingPathComponent("production-paid-video-witness", isDirectory: true)
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      var attributes = URLResourceValues(); attributes.isExcludedFromBackup = true; try url.setResourceValues(attributes)
      return url
    }
  }
  private func config() throws -> [String: String] {
    guard let value = Bundle.main.object(forInfoDictionaryKey: "NativeProductionPaidVideo") as? [String: String],
      value["enabled"] == "true", value["applicationId"] == Bundle.main.bundleIdentifier,
      value["nativeBuild"] == Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
      !(value["signedAppVersion"] ?? "").isEmpty,
      value["configurationSha256"]?.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
      DCAppAttestService.shared.isSupported else { throw PaidWitnessError.held }
    return value
  }
  func status() -> [String: Any] {
    guard let value = try? config() else { return ["protocol": "native-production-witness-v1", "available": false] }
    return ["protocol": "native-production-witness-v1", "available": true,
      "configurationSha256": value["configurationSha256"]!, "applicationId": value["applicationId"]!,
      "nativeBuild": value["nativeBuild"]!, "sdkVersion": "5.96.1"]
  }
  func invalidate() { owner = nil; prepared.removeAll(); entryReady.removeAll(); entryState.removeAll(); entryEpoch.removeAll(); liveJournalAttempt.removeAll() }
  private func owned(_ context: [String: String]) throws {
    let value = try config()
    guard UIApplication.shared.applicationState == .active, Purchases.isConfigured,
      Purchases.shared.appUserID == context["buyerId"], owner == context["sessionId"],
      value["configurationSha256"] == context["configurationSha256"],
      value["applicationId"] == context["applicationId"], value["nativeBuild"] == context["nativeBuild"],
      context["sdkVersion"] == "5.96.1" else { throw PaidWitnessError.held }
  }
  private func file(_ dispatch: String) throws -> URL {
    guard UUID(uuidString: dispatch) != nil else { throw PaidWitnessError.held }
    return try directory.appendingPathComponent(dispatch + ".json")
  }
  private func write(_ value: [String: String], dispatch: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard data.count <= 65536 else { throw PaidWitnessError.held }
    let url = try file(dispatch)
    try data.write(to: url, options: [.atomic, .completeFileProtection])
    let descriptor = try FileHandle(forWritingTo: url); try descriptor.synchronize(); try descriptor.close()
  }
  func enroll(_ challenge: String) async throws -> [String: String] {
    _ = try config()
    guard challenge.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else { throw PaidWitnessError.held }
    let key = try await DCAppAttestService.shared.generateKey()
    let attestation = try await DCAppAttestService.shared.attestKey(key,
      clientDataHash: Data(SHA256.hash(data: Data(challenge.utf8))))
    _ = try config()
    // No generic payload signer is exposed. Server enrollment must verify this
    // exact one-use challenge before this key may accompany a checkout.
    return ["keyId": key, "attestationBase64": attestation.base64EncodedString()]
  }
  func prepare(_ context: [String: String], keyId: String, authorization: String) async throws -> String {
    let required: Set<String> = ["dispatchId", "admissionId", "quoteId", "challenge", "buyerId", "sessionId",
      "productId", "grossMinor", "currency", "configurationSha256", "applicationId", "nativeBuild", "sdkVersion", "launchBeforeMs"]
    guard Set(context.keys) == required, context.values.allSatisfy({ !$0.isEmpty && $0.count <= 512 }),
      UUID(uuidString: context["dispatchId"]!) != nil, UUID(uuidString: context["sessionId"]!) != nil,
      UUID(uuidString: context["buyerId"]!) != nil,
      context["challenge"]!.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
      !keyId.isEmpty, keyId.count <= 128 else { throw PaidWitnessError.held }
    owner = context["sessionId"]; try owned(context)
    guard #available(iOS 16.0, *) else { throw PaidWitnessError.held }
    switch try await AppTransaction.shared {
    case .verified(let appTransaction):
      guard appTransaction.environment == .production, appTransaction.bundleID == context["applicationId"],
        appTransaction.appVersion == (try config())["signedAppVersion"]
        else { throw PaidWitnessError.held }
    case .unverified: throw PaidWitnessError.held
    }
    try owned(context)
    let products: [StoreProduct] = await withCheckedContinuation { continuation in
      Purchases.shared.getProducts([context["productId"]!]) { continuation.resume(returning: $0) }
    }
    try owned(context)
    guard products.count == 1, let product = products.first, product.productIdentifier == context["productId"],
      product.currencyCode == context["currency"], context["currency"] == "USD",
      let amount = Decimal(string: context["grossMinor"]!), amount > 0, amount <= 999999999, product.price * 100 == amount,
      let deadline = Double(context["launchBeforeMs"]!), deadline > Date().timeIntervalSince1970 * 1000,
      !FileManager.default.fileExists(atPath: try file(context["dispatchId"]!).path) else { throw PaidWitnessError.held }
    let handle = UUID().uuidString.lowercased(), monotonicStart = ProcessInfo.processInfo.systemUptime
    var ready = context; ready["state"] = "prepared"; ready["preparationId"] = handle; ready["keyId"] = keyId
    let witness = String(decoding: try JSONSerialization.data(withJSONObject: ready, options: [.sortedKeys]), as: UTF8.self)
    let assertion = try await DCAppAttestService.shared.generateAssertion(keyId,
      clientDataHash: Data(SHA256.hash(data: Data(witness.utf8))))
    try owned(context)
    guard let endpoint = try config()["witnessEndpoint"], let url = URL(string: endpoint), url.scheme == "https",
      url.host?.hasSuffix(".supabase.co") == true, url.path == "/functions/v1/native-production-store-witness",
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
      authorization.hasPrefix("Bearer "), authorization.count <= 16384 else { throw PaidWitnessError.held }
    var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 15
    request.setValue(authorization, forHTTPHeaderField: "Authorization")
    request.setValue(context["sessionId"]!, forHTTPHeaderField: "X-Chillywood-Auth-Session")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "authorize_launch", "dispatchId": context["dispatchId"]!,
      "witness": witness, "keyId": keyId, "assertionBase64": assertion.base64EncodedString()])
    let transport = URLSession(configuration: .ephemeral, delegate: PaidWitnessNoRedirect(), delegateQueue: nil)
    defer { transport.invalidateAndCancel() }
    let (data, response) = try await transport.data(for: request)
    try owned(context)
    guard (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 8192,
      let grant = try JSONSerialization.jsonObject(with: data) as? [String: Any], grant["status"] as? String == "LAUNCH_READY",
      grant["dispatchId"] as? String == context["dispatchId"], grant["preparationId"] as? String == handle,
      let limit = grant["launchElapsedLimitMs"] as? NSNumber, limit.int64Value > 0, limit.int64Value <= 300000,
      ceil((ProcessInfo.processInfo.systemUptime - monotonicStart) * 1000) < Double(limit.int64Value)
      else { throw PaidWitnessError.held }
    prepared[handle] = Prepared(context: context, product: product, keyId: keyId,
      preparationId: handle, monotonicStart: monotonicStart, elapsedLimitMs: limit.int64Value, authorization: authorization)
    entryState[handle] = .prepared
    return handle
  }
  func authorizeEntry(_ handle: String) async throws {
    guard let value = prepared[handle] else { throw PaidWitnessError.held }
    let context = value.context, dispatch = context["dispatchId"]!
    try owned(context)
    if entryState[handle] == .ready { return }
    guard entryState[handle] == .prepared else { throw PaidWitnessError.held }
    let epoch = UUID(); entryEpoch[handle] = epoch; entryState[handle] = .authorizing
    defer {
      // Only this still-current failed authorization can become retryable.
      // Invalidation, another epoch or an invoked handle can never be revived.
      if entryEpoch[handle] == epoch && entryState[handle] == .authorizing {
        entryState[handle] = .prepared
      }
    }
    // A retained handle cannot bypass an atomically retired unclaimed intent.
    // Bearer is memory-only; the server binds its verified JWT session.
    guard let endpoint = try config()["witnessEndpoint"], let url = URL(string: endpoint), url.scheme == "https",
      url.host?.hasSuffix(".supabase.co") == true, url.path == "/functions/v1/native-production-store-witness",
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { throw PaidWitnessError.held }
    var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 15
    request.setValue(value.authorization, forHTTPHeaderField: "Authorization")
    request.setValue(context["sessionId"]!, forHTTPHeaderField: "X-Chillywood-Auth-Session")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "authorize_invoke", "dispatchId": dispatch,
      "preparationId": value.preparationId])
    let transport = URLSession(configuration: .ephemeral, delegate: PaidWitnessNoRedirect(), delegateQueue: nil)
    defer { transport.invalidateAndCancel() }
    let (data, response) = try await transport.data(for: request)
    try owned(context)
    guard entryEpoch[handle] == epoch, entryState[handle] == .authorizing,
      prepared[handle] != nil else { throw PaidWitnessError.held }
    guard (response as? HTTPURLResponse)?.statusCode == 200, data.count <= 8192,
      let grant = try JSONSerialization.jsonObject(with: data) as? [String: Any], grant["status"] as? String == "INVOKE_READY",
      grant["dispatchId"] as? String == dispatch, grant["preparationId"] as? String == value.preparationId
      else { throw PaidWitnessError.held }
    entryReady[handle] = value
    entryState[handle] = .ready
  }
  func purchase(_ handle: String, promise: Promise) throws {
    guard entryState[handle] == .ready, let value = entryReady[handle] else { throw PaidWitnessError.held }
    let epoch = UUID(); entryEpoch[handle] = epoch; entryState[handle] = .checking
    defer {
      // Synchronous failures before SDK entry are known no-invocation only in
      // this live stack. Neither persisted bytes nor a restart can restore it.
      if entryEpoch[handle] == epoch && entryState[handle] == .checking { entryState[handle] = .ready }
    }
    let context = value.context, dispatch = context["dispatchId"]!
    try owned(context)
    guard let deadline = Double(context["launchBeforeMs"]!), deadline > Date().timeIntervalSince1970 * 1000,
      (liveJournalAttempt.contains(handle) || !FileManager.default.fileExists(atPath: try file(dispatch).path)) else { throw PaidWitnessError.held }
    var journal = context; journal["keyId"] = value.keyId; journal["state"] = "invoking"
    journal["preparationId"] = value.preparationId
    journal["launchedAtMs"] = String(Int64(Date().timeIntervalSince1970 * 1000))
    liveJournalAttempt.insert(handle)
    try write(journal, dispatch: dispatch)
    // No await from final ownership check through the sole Store invocation.
    // Persisted bytes alone never authorize a purchase; only this live
    // never-entered stack may retry a failed pre-entry journal write.
    try owned(context)
    let elapsed = ceil((ProcessInfo.processInfo.systemUptime - value.monotonicStart) * 1000)
    guard deadline > Date().timeIntervalSince1970 * 1000, elapsed.isFinite, elapsed >= 0,
      elapsed < Double(value.elapsedLimitMs) else { throw PaidWitnessError.held }
    journal["elapsedToLaunchMs"] = String(Int64(elapsed))
    let purchases = Purchases.shared
    guard entryEpoch[handle] == epoch, entryState[handle] == .checking else { throw PaidWitnessError.held }
    // Truthful one-way boundary immediately before entering the SDK. Any
    // failure from the SDK or afterward is uncertain and cannot restore it.
    entryState[handle] = .invoked; entryEpoch.removeValue(forKey: handle)
    entryReady.removeValue(forKey: handle); prepared.removeValue(forKey: handle); liveJournalAttempt.remove(handle)
    // The exact call sample is captured in the native completion closure. A
    // crash before that callback remains unknown; it cannot reconstruct a sale.
    purchases.purchase(product: value.product) { transaction, _, error, cancelled in
      Task { @MainActor in
        var result = journal
        do {
          guard error == nil, !cancelled, let transaction = transaction,
            transaction.productIdentifier == context["productId"], !transaction.transactionIdentifier.isEmpty else {
            result["state"] = cancelled ? "cancelled" : "unknown"; try self.write(result, dispatch: dispatch)
            promise.resolve(["status": result["state"]!, "dispatchId": dispatch]); return
          }
          result["state"] = "completed"; result["transactionId"] = transaction.transactionIdentifier
          result["completedAtMs"] = String(Int64(Date().timeIntervalSince1970 * 1000))
          // Persist the exact callback BEFORE attestation can fail or the account
          // can switch. Recovery can re-attest this record, never call purchase.
          try self.write(result, dispatch: dispatch)
          promise.resolve(try await self.attestStored(dispatch, buyer: context["buyerId"]!, session: context["sessionId"]!))
        } catch { promise.resolve(["status": "unknown", "dispatchId": dispatch]) }
      }
    }
    // Sampling after the synchronous SDK method returns is a conservative
    // upper bound on entry. Completion runs in a later MainActor task.
    journal["elapsedToLaunchMs"] = String(Int64(ceil((ProcessInfo.processInfo.systemUptime - value.monotonicStart) * 1000)))
    try write(journal, dispatch: dispatch)
  }
  func attestStored(_ dispatch: String, buyer: String, session: String) async throws -> [String: String] {
    let raw = try Data(contentsOf: file(dispatch))
    guard raw.count <= 65536, let record = try JSONSerialization.jsonObject(with: raw) as? [String: String],
      record["state"] == "completed", record["buyerId"] == buyer, record["sessionId"] == session,
      Purchases.isConfigured, Purchases.shared.appUserID == buyer,
      let keyId = record["keyId"] else { throw PaidWitnessError.held }
    _ = try config()
    let witness = String(decoding: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]), as: UTF8.self)
    let assertion = try await DCAppAttestService.shared.generateAssertion(keyId,
      clientDataHash: Data(SHA256.hash(data: Data(witness.utf8))))
    return ["status": "witness", "dispatchId": dispatch, "witness": witness,
      "keyId": keyId, "assertionBase64": assertion.base64EncodedString()]
  }
}
public final class ChillywoodProductionPaidVideoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChillywoodProductionPaidVideo")
    Constants(["available": (Bundle.main.object(forInfoDictionaryKey: "NativeProductionPaidVideo") as? [String: String])?["enabled"] == "true"])
    AsyncFunction("invalidateOwner") { () async in await PaidWitnessRuntime.shared.invalidate() }
    AsyncFunction("status") { () async -> [String: Any] in await PaidWitnessRuntime.shared.status() }
    AsyncFunction("enroll") { (challenge: String) async throws -> [String: String] in
      try await PaidWitnessRuntime.shared.enroll(challenge)
    }
    AsyncFunction("prepare") { (context: [String: String], keyId: String, authorization: String) async throws -> String in
      try await PaidWitnessRuntime.shared.prepare(context, keyId: keyId, authorization: authorization)
    }
    AsyncFunction("purchase") { (handle: String, promise: Promise) in
      Task { @MainActor in
        do { try PaidWitnessRuntime.shared.purchase(handle, promise: promise) }
        catch { promise.reject("purchase_held", "Production purchase is unavailable.") }
      }
    }
    AsyncFunction("authorizeEntry") { (handle: String) async throws in
      try await PaidWitnessRuntime.shared.authorizeEntry(handle)
    }
    AsyncFunction("recover") { (dispatch: String, buyer: String, session: String) async throws -> [String: String] in
      try await PaidWitnessRuntime.shared.attestStored(dispatch, buyer: buyer, session: session)
    }
  }
}
