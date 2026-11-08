import Foundation

enum TestStoreAdmissionError: Error { case buildUnavailable, subjectInvalid, configurationRetired, foreignConfiguration, configurationUnknown }
enum TestStoreAdmissionPolicy {
  static let applicationId = "com.chillywood.mobile.teststoredebug"
  private static let lock = NSLock()
  private static var attempted = false
  private static var ownedUser: String?
  private static let keys: Set<String> = ["protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace"]
  static var compiledDebug: Bool {
    #if DEBUG
    return true
    #else
    return false
    #endif
  }
  static func snapshot(applicationId actualId: String?, config: [String: String]) -> [String: String]? {
    guard compiledDebug, actualId == applicationId, Set(config.keys) == keys,
      config["protocol"] == "isolated-test-store-build-v1", config["mode"] == "test-store-debug",
      config["platform"] == "ios", config["applicationId"] == applicationId,
      config["storageNamespace"] == "@chillywood/test-store-debug-v1",
      matches(config["projectId"], "[A-Za-z0-9_-]{4,100}"), matches(config["appId"], "[A-Za-z0-9_-]{4,100}"),
      matches(config["publicSdkKey"], "test_[A-Za-z0-9_-]{8,200}"), matches(config["configId"], "[a-f0-9]{64}") else { return nil }
    return config
  }
  static func configure(applicationId actualId: String?, config: [String: String], user: String,
    alreadyConfigured: () -> Bool, configure: () throws -> Void) throws -> [String: String] {
    guard let admitted = snapshot(applicationId: actualId, config: config) else { throw TestStoreAdmissionError.buildUnavailable }
    guard matches(user, "scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}") else { throw TestStoreAdmissionError.subjectInvalid }
    lock.lock(); defer { lock.unlock() }
    guard !attempted else { throw TestStoreAdmissionError.configurationRetired }
    attempted = true
    guard !alreadyConfigured() else { throw TestStoreAdmissionError.foreignConfiguration }
    do { try configure() } catch { throw TestStoreAdmissionError.configurationUnknown }
    ownedUser = user
    return admitted
  }
  static func owns(user: String, currentIdentityMatches: () -> Bool) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return ownedUser == user && currentIdentityMatches()
  }
  private static func matches(_ value: String?, _ pattern: String) -> Bool {
    guard let value = value else { return false }
    return value.range(of: "\\A(?:" + pattern + ")\\z", options: .regularExpression) != nil
  }
}
