import Foundation

// Actual production declarations/methods are inserted by the runner. The
// platform APIs record category/activation receipts; no device claim is made.
// INSERT_DECLARATIONS
private struct ActiveNativeCall {}
private struct PendingIncomingReport {}
private final class UIApplication {
  enum State { case active, inactive, background }
  static let shared = UIApplication()
  var applicationState = State.active
}
private final class CXCallObserver {
  struct Call { var hasEnded: Bool }
  static var inventory: [Call] = []
  var calls: [Call] { Self.inventory }
}
private final class AVAudioSession {
  enum Category { case playAndRecord }
  enum Mode { case voiceChat, videoChat }
  enum Option { case allowBluetoothHFP, allowBluetoothA2DP }
  static let shared = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { shared }
  var categories: [(Category, Mode, [Option])] = []
  var activations: [Bool] = []
  var failCategory = false
  func setCategory(_ category: Category, mode: Mode, options: [Option]) throws {
    if failCategory { throw NSError(domain: "native-category", code: -50) }
    categories.append((category, mode, options))
  }
  func setActive(_ active: Bool) throws { activations.append(active) }
}
private final class Probe {
  var isBuildEnabled = true
  var isRuntimeDefaultEnabled = true
  var authority: NativeVoipAuthority? = expectedAuthority
  private var outgoingAudioHandoff: OutgoingAudioHandoff?
  private var retiredOutgoingAudioOwners: Set<UUID> = []
  var callKitAudioActivationOwners: [UUID: Bool] = [:]
  var pendingAnswerActions: [UUID: Bool] = [:]
  var requestedAnswerTransactions: Set<UUID> = []
  var terminal: Set<String> = []
  var events: [[String: Any]] = []
  func persistedVoipAuthority() -> NativeVoipAuthority? { authority }
  func isTerminalInvite(_ inviteId: String) -> Bool { terminal.contains(inviteId) }
  func emitRaw(_ event: [String: Any]) { events.append(event) }
  func active(_ present: Bool) { activeCalls = present ? [UUID(): ActiveNativeCall()] : [:] }
  func pending(_ present: Bool) { pendingIncomingReports = present ? [UUID(): PendingIncomingReport()] : [:] }
  func callKitActive() { callKitAudioSessionActive = true }
  var prepared: Bool { outgoingAudioHandoff?.prepared == true }
  // INSERT_MEMBERS
}
private let expectedAuthority = NativeVoipAuthority(userId: UUID().uuidString, accountId: "", sessionGeneration: UUID().uuidString, installId: "installed-test-device")
private var passed = 0
private func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(name)\n".utf8)); exit(1)
  }
  passed += 1
}
private func rejects(_ name: String, _ action: () throws -> Void) {
  do { try action(); expect(false, name) } catch { passed += 1 }
}
private func binding(_ owner: UUID = UUID(), video: Bool = false) -> [String: Any] {
  ["ownerId": owner.uuidString, "userId": expectedAuthority.userId, "accountId": expectedAuthority.userId,
    "sessionGeneration": expectedAuthority.sessionGeneration, "installId": expectedAuthority.installId,
    "inviteId": UUID().uuidString, "threadId": UUID().uuidString, "roomId": "ROOM42", "callType": video ? "video" : "voice"]
}
private func probe() -> Probe {
  UIApplication.shared.applicationState = .active
  CXCallObserver.inventory = []
  AVAudioSession.shared.categories = []; AVAudioSession.shared.activations = []; AVAudioSession.shared.failCategory = false
  let value = Probe()
  value.authority = NativeVoipAuthority(userId: expectedAuthority.userId, accountId: expectedAuthority.userId,
    sessionGeneration: expectedAuthority.sessionGeneration, installId: expectedAuthority.installId)
  return value
}
private func owner(_ value: [String: Any]) -> String { value["ownerId"] as! String }

for video in [false, true] {
  let p = probe(), b = binding(video: video)
  try p.beginOutgoingAudioHandoff(b)
  expect(AVAudioSession.shared.categories.isEmpty, "begin does not touch native audio")
  try p.prepareOutgoingAudioHandoff(owner(b))
  expect(p.prepared && AVAudioSession.shared.categories.count == 1, "real six-character room admits category preparation")
  expect(AVAudioSession.shared.categories[0].0 == .playAndRecord
    && AVAudioSession.shared.categories[0].1 == (video ? .videoChat : .voiceChat)
    && AVAudioSession.shared.categories[0].2 == [.allowBluetoothHFP, .allowBluetoothA2DP], "voice/video category has exact options")
  expect(AVAudioSession.shared.activations.isEmpty, "category prepare never activates or deactivates audio")
  try p.beginOutgoingAudioHandoff(b); try p.prepareOutgoingAudioHandoff(owner(b))
  expect(AVAudioSession.shared.categories.count == 1, "repeated same-owner preparation is idempotent")
  p.retireOutgoingAudioHandoff(owner(b))
  expect(AVAudioSession.shared.categories.count == 1 && AVAudioSession.shared.activations.isEmpty, "retire does not reset shared session")
}
for field in ["userId", "accountId", "sessionGeneration", "installId"] {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  let a = p.authority!
  p.authority = NativeVoipAuthority(userId: field == "userId" ? UUID().uuidString : a.userId,
    accountId: field == "accountId" ? UUID().uuidString : a.accountId,
    sessionGeneration: field == "sessionGeneration" ? UUID().uuidString : a.sessionGeneration,
    installId: field == "installId" ? "replacement-install" : a.installId)
  rejects("changed account authority cannot prepare") { try p.prepareOutgoingAudioHandoff(owner(b)) }
  expect(AVAudioSession.shared.categories.isEmpty, "changed authority cannot mutate category")
}
for state in [UIApplication.State.background, .inactive] {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  UIApplication.shared.applicationState = state
  rejects("background cannot prepare") { try p.prepareOutgoingAudioHandoff(owner(b)) }
}
do {
  let p = probe(), b = binding(); p.retireOutgoingAudioHandoff(owner(b))
  rejects("retire before queued begin prevents resurrection") { try p.beginOutgoingAudioHandoff(b) }
}
for (name, block) in [
  ("active native call blocks begin", { (p: Probe) in p.active(true) }),
  ("pending native report blocks begin", { (p: Probe) in p.pending(true) }),
  ("pending Answer blocks begin", { (p: Probe) in p.pendingAnswerActions[UUID()] = true }),
  ("requested Answer blocks begin", { (p: Probe) in p.requestedAnswerTransactions.insert(UUID()) }),
  ("CallKit activation blocks begin", { (p: Probe) in p.callKitActive() }),
  ("retained CallKit activation blocks begin", { (p: Probe) in p.callKitAudioActivationOwners[UUID()] = true }),
] as [(String, (Probe) -> Void)] {
  let p = probe(); block(p)
  rejects(name) { try p.beginOutgoingAudioHandoff(binding()) }
}
do {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  p.pending(true); p.pending(false)
  rejects("pending report retires old owner even after report removal") { try p.prepareOutgoingAudioHandoff(owner(b)) }
  expect(p.events.count == 1 && p.events[0]["type"] as? String == "outgoingAudioHandoffRevoked"
    && p.events[0]["outgoingAudioOwnerId"] as? String == owner(b).lowercased(), "CallKit takeover emits exact revoked owner")
}
do {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b); p.active(true); p.active(false)
  rejects("active CallKit takeover cannot revive old lease") { try p.prepareOutgoingAudioHandoff(owner(b)) }
}
do {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  let next = binding(); try p.beginOutgoingAudioHandoff(next); p.retireOutgoingAudioHandoff(owner(b))
  rejects("old owner cannot prepare replacement") { try p.prepareOutgoingAudioHandoff(owner(b)) }
  try p.prepareOutgoingAudioHandoff(owner(next))
  expect(p.prepared && AVAudioSession.shared.categories.count == 1, "old retirement preserves replacement owner")
}
do {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  for field in ["inviteId", "threadId", "roomId", "callType"] {
    var rebound = b; rebound[field] = field == "callType" ? "video" : field == "roomId" ? "OTHER1" : UUID().uuidString
    rejects("same owner cannot change exact call binding") { try p.beginOutgoingAudioHandoff(rebound) }
  }
  AVAudioSession.shared.failCategory = true
  rejects("native category failure propagates") { try p.prepareOutgoingAudioHandoff(owner(b)) }
  expect(!p.prepared, "native failure cannot create readiness")
}
for room in ["ABC12", "bad room", " ROOM42", "ROOM42\n", String(repeating: "A", count: 65)] {
  let p = probe(); var b = binding(); b["roomId"] = room
  rejects("invalid room code rejected") { try p.beginOutgoingAudioHandoff(b) }
}
do {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  CXCallObserver.inventory = [.init(hasEnded: false)]
  rejects("another observed system call blocks commit") { try p.prepareOutgoingAudioHandoff(owner(b)) }
  CXCallObserver.inventory = [.init(hasEnded: true)]
  try p.prepareOutgoingAudioHandoff(owner(b))
}
for disabled in ["build", "runtime", "terminal", "authority"] {
  let p = probe(), b = binding(); try p.beginOutgoingAudioHandoff(b)
  if disabled == "build" { p.isBuildEnabled = false }
  if disabled == "runtime" { p.isRuntimeDefaultEnabled = false }
  if disabled == "terminal" { p.terminal.insert(b["inviteId"] as! String) }
  if disabled == "authority" { p.authority = nil }
  rejects("current eligibility is required at native commit") { try p.prepareOutgoingAudioHandoff(owner(b)) }
}
print("Outgoing handoff: \(passed) checks PASS")
