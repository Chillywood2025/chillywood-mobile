import Foundation
import CoreFoundation

enum TestStoreV2Contract {
  static func object(_ raw: String) throws -> [String: Any] {
    try TestStoreV2Policy.require(raw.utf8.count <= 32000)
    guard let data = raw.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw TestStoreV2Error.unavailable }
    return value
  }
  static func json(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard let text = String(data: data, encoding: .utf8), data.count <= 32000 else { throw TestStoreV2Error.unavailable }; return text
  }
  static func keys(_ value: [String: Any], _ names: [String]) throws { try TestStoreV2Policy.require(Set(value.keys) == Set(names)) }
  static func text(_ value: Any?, _ max: Int = 200) throws -> String {
    guard let value = value as? String, !value.isEmpty, value.utf8.count <= max,
      value.trimmingCharacters(in: .whitespacesAndNewlines) == value,
      value.rangeOfCharacter(from: .controlCharacters) == nil else { throw TestStoreV2Error.unavailable }; return value
  }
  static func id(_ value: Any?, _ prefix: String = "") throws -> String {
    let v = try text(value); try TestStoreV2Policy.require(v.hasPrefix(prefix) && TestStoreV2Policy.uuid(String(v.dropFirst(prefix.count)))); return v
  }
  static func integer(_ value: Any?) throws -> Int64 {
    guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue > 0,
      n.doubleValue <= 9007199254740991, n.doubleValue == Double(n.int64Value) else { throw TestStoreV2Error.unavailable }; return n.int64Value
  }
  static func boolean(_ value: Any?) throws -> Bool {
    guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { throw TestStoreV2Error.unavailable }; return n.boolValue
  }
  static func date(_ value: Any?) throws -> Date {
    let value = try text(value)
    let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let parsed = parser.date(from: value) { return parsed }; parser.formatOptions = [.withInternetDateTime]
    guard let parsed = parser.date(from: value) else { throw TestStoreV2Error.unavailable }; return parsed
  }
  static func now() -> String { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.string(from: Date()) }
  static func build(_ actualId: String?, _ config: [String: String]) -> [String: String]? {
    #if !DEBUG
    return nil
    #else
    guard actualId == TestStoreV2Policy.applicationId,
      Set(config.keys) == Set(["protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace"]),
      config["protocol"] == "isolated-test-store-build-v2", config["mode"] == "test-store-debug-v2", config["platform"] == "ios",
      config["applicationId"] == actualId, config["storageNamespace"] == "@chillywood/test-store-debug-v2",
      config["publicSdkKey"]?.range(of: "\\Atest_[A-Za-z0-9_-]{8,200}\\z", options: .regularExpression) != nil,
      config["configId"]?.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil,
      config["projectId"]?.range(of: "\\A[A-Za-z0-9_-]{4,100}\\z", options: .regularExpression) != nil,
      config["appId"]?.range(of: "\\A[A-Za-z0-9_-]{4,100}\\z", options: .regularExpression) != nil else { return nil }; return config
    #endif
  }
  static func customer(_ raw: String, _ config: [String: String], _ installationId: String) throws -> [String: Any] {
    let c = try object(raw)
    try keys(c, ["id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"])
    _ = try id(c["id"], "scv2_customer_"); _ = try id(c["buyerId"]); _ = try id(c["installationId"])
    let uid = try id(c["providerAppUserId"], "scv2_teststore_")
    try TestStoreV2Policy.require(uid.range(of: "\\Ascv2_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\z", options: .regularExpression) != nil
      && c["installationId"] as? String == installationId && c["configurationDigest"] as? String == config["configId"]
      && c["projectId"] as? String == config["projectId"] && c["appId"] as? String == config["appId"]
      && c["provider"] as? String == "revenuecat" && c["store"] as? String == "TEST_STORE" && c["sourceEnvironment"] as? String == "SANDBOX")
    _ = try text(c["providerScopeKey"], 500); _ = try text(c["economicApplicationId"], 500); return c
  }
  static func allocation(_ raw: String, _ customer: [String: Any]) throws -> [String: Any] {
    let a = try object(raw)
    try keys(a, ["id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "quote", "acceptPurchaseUntil", "registration"])
    _ = try id(a["id"], "scv2_allocation_"); _ = try id(a["intentId"], "scv1_intent_"); _ = try id(a["dispatchId"])
    try TestStoreV2Policy.require(a["customerBindingId"] as? String == customer["id"] as? String
      && a["configurationDigest"] as? String == customer["configurationDigest"] as? String)
    _ = try text(a["productId"]); _ = try date(a["acceptPurchaseUntil"])
    guard let q = a["quote"] as? [String: Any], let r = a["registration"] as? [String: Any] else { throw TestStoreV2Error.unavailable }
    try keys(q, ["offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency"])
    _ = try id(q["offerId"], "scv1_offer_"); _ = try id(q["resourceId"], "scv1_resource_"); _ = try id(q["creatorId"])
    _ = try integer(q["offerRevision"]); _ = try integer(q["resourceRevision"]); _ = try integer(q["amountMinor"])
    try TestStoreV2Policy.require(q["kind"] as? String == "creator_tip" && q["currency"] as? String == "usd" && q["creatorId"] as? String != customer["buyerId"] as? String)
    try keys(r, ["id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"])
    _ = try id(r["id"], "scv2_registration_")
    for key in ["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"] { _ = try text(r[key]) }
    try TestStoreV2Policy.require(r["productId"] as? String == a["productId"] as? String); return a
  }
  static func invocation(_ customer: [String: Any], _ allocation: [String: Any], _ session: String) throws -> [String: Any] {
    _ = try id(session); let registration = allocation["registration"] as! [String: Any]
    return ["protocol": "isolated-test-store-native-v2", "invocationId": allocation["dispatchId"]!, "customerBindingId": customer["id"]!,
      "installationId": customer["installationId"]!, "buyerId": customer["buyerId"]!, "configurationDigest": customer["configurationDigest"]!,
      "providerAppUserId": customer["providerAppUserId"]!, "allocationId": allocation["id"]!, "registrationId": registration["id"]!,
      "sessionId": session, "state": "prepared", "outcome": NSNull(), "transactionHint": NSNull(), "completedAt": NSNull()]
  }
}
