import Foundation
import CoreFoundation
import CryptoKit

enum QualificationContract {
  static func json(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]); try QualificationPolicy.require(data.count <= 32000)
    return String(decoding: data, as: UTF8.self)
  }
  static func object(_ raw: String) throws -> [String: Any] {
    try QualificationPolicy.require(raw.utf8.count <= 32000)
    guard let value = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { throw QualificationError.unavailable }; return value
  }
  static func hash(_ raw: String) -> String { SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined() }
  static func keys(_ value: [String: Any], _ fields: [String]) throws { try QualificationPolicy.require(Set(value.keys) == Set(fields)) }
  static func text(_ value: Any?) throws -> String {
    guard let value = value as? String, value.range(of: "\\A[A-Za-z0-9_.$:-]{1,160}\\z", options: .regularExpression) != nil else { throw QualificationError.unavailable }; return value
  }
  static func id(_ value: Any?) throws -> String { let v = try text(value); try QualificationPolicy.require(v.range(of: "\\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\z", options: .regularExpression) != nil); return v }
  static func integer(_ value: Any?) throws -> Int64 {
    guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue > 0, n.doubleValue <= 9007199254740991,
      n.doubleValue == Double(n.int64Value) else { throw QualificationError.unavailable }; return n.int64Value
  }
  static func now() -> String { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.string(from: Date()) }
  static func build(_ actualId: String?, _ raw: [String: String]) throws -> [String: Any] {
    #if !DEBUG
    throw QualificationError.unavailable
    #else
    try QualificationPolicy.require(actualId == QualificationPolicy.applicationId && Set(raw.keys) == Set(["descriptorJson", "publicSdkKey", "configurationDigest"]))
    guard let descriptor = raw["descriptorJson"], let key = raw["publicSdkKey"], let digest = raw["configurationDigest"] else { throw QualificationError.unavailable }
    try QualificationPolicy.require(key.range(of: "\\Atest_[A-Za-z0-9_-]{8,200}\\z", options: .regularExpression) != nil && hash(descriptor) == digest)
    let d = try object(descriptor)
    try keys(d, ["protocol", "mode", "platform", "applicationId", "runtime", "storageNamespace", "qualificationConnectionId", "qualificationConnectionRevision", "projectId", "appId", "publicSdkKeySha256", "runId", "scenarios"])
    try QualificationPolicy.require(d["protocol"] as? String == "test-store-qualification-build-v1" && d["mode"] as? String == "record-only-debug"
      && d["platform"] as? String == "ios" && d["applicationId"] as? String == actualId && d["runtime"] as? String == "scq-v1-ios"
      && d["storageNamespace"] as? String == "scq-native-v1" && d["publicSdkKeySha256"] as? String == hash(key))
    _ = try id(d["qualificationConnectionId"]); _ = try integer(d["qualificationConnectionRevision"]); _ = try id(d["runId"])
    _ = try text(d["projectId"]); _ = try text(d["appId"])
    guard let scenarios = d["scenarios"] as? [[String: Any]], !scenarios.isEmpty, scenarios.count <= 8 else { throw QualificationError.unavailable }
    var ids = Set<String>()
    for s in scenarios {
      try keys(s, ["id", "label", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId", "amountMinor", "currency", "intendedAction"])
      let scenarioId = try id(s["id"]); try QualificationPolicy.require(ids.insert(scenarioId).inserted)
      guard let label = s["label"] as? String, !label.isEmpty, label.count <= 80, label.rangeOfCharacter(from: .controlCharacters) == nil else { throw QualificationError.unavailable }
      for k in ["providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"] { _ = try text(s[k]) }
      try QualificationPolicy.require(try integer(s["amountMinor"]) <= 10000)
      try QualificationPolicy.require(s["currency"] as? String == "usd" && ["purchase", "cancel"].contains(s["intendedAction"] as? String ?? ""))
    }
    return d
    #endif
  }
}
