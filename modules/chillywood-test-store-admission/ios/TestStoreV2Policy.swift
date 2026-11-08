import Foundation

enum TestStoreV2Error: Error { case unavailable }
/// Store.commit atomically persists and verifies one complete snapshot. Provider
/// receipt authority is deliberately absent from this native lifetime policy.
final class TestStoreV2Policy {
  typealias Snapshot = [String: String]
  static let applicationId = "com.chillywood.mobile.teststoredebugv2"
  private let load: () throws -> Snapshot?
  private let persist: (Snapshot) throws -> Void
  private var state: Snapshot
  private var configurationAttempted = false, configured = false
  private(set) var retired = false
  private var session: String?, handle: String?, handleDispatch: String?, handleFingerprint: String?, nativeInvocation: String?, lookup: String?
  init(load: @escaping () throws -> Snapshot?, commit: @escaping (Snapshot) throws -> Void) throws {
    self.load = load; self.persist = commit
    let loaded = try load()
    let initial = loaded ?? ["version": "2", "installationId": UUID().uuidString.lowercased(), "owner": "", "active": ""]
    try Self.validate(initial)
    if loaded == nil { try commit(initial); try Self.require(try load() == initial) }
    state = initial
  }
  static func uuid(_ value: String?) -> Bool {
    guard let value = value else { return false }
    return value.range(of: "\\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\z", options: .regularExpression) != nil
  }
  static func cacheMatches(expected: String, footprint: Bool, identities: [String]) -> Bool {
    footprint ? !identities.isEmpty && identities.allSatisfy { $0 == expected } : identities.isEmpty
  }
  static func require(_ value: Bool) throws { if !value { throw TestStoreV2Error.unavailable } }
  private static func validate(_ value: Snapshot) throws {
    try require(value.count >= 4 && value.count <= 1004 && value["version"] == "2" && uuid(value["installationId"])
      && value["owner"] != nil && value["active"] != nil && (value["active"] == "" || uuid(value["active"])))
    for (key, item) in value {
      try require(item.utf8.count <= 32000 && (["version", "installationId", "owner", "active"].contains(key)
        || (key.hasPrefix("record:") && uuid(String(key.dropFirst(7))))))
    }
    try require(value["active"] == "" || value["record:" + value["active"]!] != nil)
  }
  private func commit(_ next: Snapshot) throws {
    try Self.validate(next); try persist(next); try Self.require(try load() == next); state = next
  }
  var installationId: String { state["installationId"]! }
  var owner: String { state["owner"]! }
  var active: String { state["active"]! }
  func read(_ dispatchId: String) throws -> String? { try Self.require(Self.uuid(dispatchId)); return state["record:" + dispatchId] }
  func isNativeInvocation(_ dispatchId: String) -> Bool { nativeInvocation == dispatchId }
  func bind(ownerDocument: String, capturedSession: String, alreadyConfigured: () -> Bool, configure: () throws -> Void) throws {
    try Self.require(Self.uuid(capturedSession) && !ownerDocument.isEmpty && !retired)
    if !owner.isEmpty && owner != ownerDocument { retired = true; throw TestStoreV2Error.unavailable }
    if session != nil && session != capturedSession { retired = true; throw TestStoreV2Error.unavailable }
    if owner.isEmpty { var next = state; next["owner"] = ownerDocument; try commit(next) }
    session = capturedSession
    if configured { return }
    try Self.require(!configurationAttempted); configurationAttempted = true
    try Self.require(!alreadyConfigured()); try configure(); configured = true
  }
  func current(_ capturedSession: String) throws { try Self.require(configured && !retired && capturedSession == session) }
  func retire(_ capturedSession: String) { if capturedSession == session { retired = true; handle = nil } }
  func beginLookup(dispatchId: String, capturedSession: String) throws -> String {
    try current(capturedSession)
    try Self.require(Self.uuid(dispatchId) && lookup == nil && active.isEmpty && state["record:" + dispatchId] == nil)
    let token = UUID().uuidString.lowercased(); lookup = token; return token
  }
  func endLookup(_ token: String) throws { try Self.require(token == lookup); lookup = nil }
  func reserveAfterLookup(token: String, dispatchId: String, capturedSession: String, fingerprint: String, document: String) throws -> String {
    try Self.require(token == lookup)
    let ticket = try reserve(dispatchId: dispatchId, capturedSession: capturedSession, fingerprint: fingerprint, preparedDocument: document)
    lookup = nil; return ticket
  }
  func reserve(dispatchId: String, capturedSession: String, fingerprint: String, preparedDocument: String) throws -> String {
    try current(capturedSession)
    try Self.require(Self.uuid(dispatchId) && active.isEmpty && state["record:" + dispatchId] == nil
      && fingerprint.range(of: "\\A[a-f0-9]{64}\\z", options: .regularExpression) != nil)
    var next = state; next["active"] = dispatchId; next["record:" + dispatchId] = preparedDocument; try commit(next)
    let ticket = UUID().uuidString.lowercased(); handle = ticket; handleDispatch = dispatchId; handleFingerprint = fingerprint; return ticket
  }
  func prepared(ticket: String, dispatchId: String, capturedSession: String, fingerprint: String) throws {
    try current(capturedSession)
    try Self.require(ticket == handle && dispatchId == handleDispatch && dispatchId == active && fingerprint == handleFingerprint && nativeInvocation == nil)
  }
  func invoke(ticket: String, dispatchId: String, capturedSession: String, fingerprint: String, invokingDocument: String) throws {
    try prepared(ticket: ticket, dispatchId: dispatchId, capturedSession: capturedSession, fingerprint: fingerprint)
    var next = state; next["record:" + dispatchId] = invokingDocument; try commit(next); handle = nil; nativeInvocation = dispatchId
  }
  func complete(dispatchId: String, completedDocument: String) throws {
    try Self.require(dispatchId == nativeInvocation && dispatchId == active)
    var next = state; next["record:" + dispatchId] = completedDocument; next["active"] = ""
    try commit(next); nativeInvocation = nil; handleDispatch = nil; handleFingerprint = nil
  }
}
