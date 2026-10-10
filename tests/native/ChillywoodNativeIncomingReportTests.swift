import Foundation

// The runner inserts actual production declarations below. These API doubles
// hold CallKit callbacks so timing, ownership, and settlement assertions execute
// the same production code as the application.
// INSERT_NATIVE_ERROR
// INSERT_AUTHORITY
// INSERT_ACTIVE_CALL
// INSERT_PENDING_REPORT

private enum ReportProbeError: Error { case rejected }
private let AVAudioSessionInterruptionTypeKey = "AVAudioSessionInterruptionTypeKey"
public final class AVAudioSession {
  enum Category { case playAndRecord }
  enum Mode { case voiceChat }
  struct CategoryOptions: OptionSet {
    let rawValue: Int
    static let allowBluetoothHFP = Self(rawValue: 1)
    static let allowBluetoothA2DP = Self(rawValue: 2)
  }
  struct SetActiveOptions: OptionSet {
    let rawValue: Int
    static let notifyOthersOnDeactivation = Self(rawValue: 1)
  }
  enum InterruptionType: UInt { case began = 1, ended = 0 }
  static let singleton = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { singleton }
  func setCategory(_ category: Category, mode: Mode, options: CategoryOptions) throws {}
  func setActive(_ active: Bool, options: SetActiveOptions = []) throws {}
}
private let CXErrorDomainIncomingCall = "com.apple.CallKit.error.incomingcall"
private enum CXErrorCodeIncomingCallError: Int { case callUUIDAlreadyExists = 2 }
private let duplicateIncomingError = NSError(domain: CXErrorDomainIncomingCall,
  code: CXErrorCodeIncomingCallError.callUUIDAlreadyExists.rawValue)
enum HandleType { case generic }
final class CXHandle {
  let value: String
  init(type: HandleType, value: String) { self.value = value }
}
final class CXCallUpdate {
  var remoteHandle: CXHandle?
  var localizedCallerName: String?
  var hasVideo = false
  var supportsHolding = true
  var supportsGrouping = true
  var supportsUngrouping = true
  var supportsDTMF = true
}
enum EndReason { case remoteEnded, unanswered, failed, answeredElsewhere }
typealias CXCallEndedReason = EndReason
public final class CXProvider {
  struct Request { let uuid: UUID; let update: CXCallUpdate; let callback: (Error?) -> Void }
  var requests: [Request] = []
  var ended: [UUID] = []
  func reportNewIncomingCall(with uuid: UUID, update: CXCallUpdate, completion: @escaping (Error?) -> Void) {
    requests.append(Request(uuid: uuid, update: update, callback: completion))
  }
  func reportCall(with uuid: UUID, endedAt: Date, reason: EndReason) { ended.append(uuid) }
  func complete(_ index: Int = 0, error: Error? = nil) {
    let request = requests[index]
    if error == nil { CXCallObserver.observedCalls.append(.init(uuid: request.uuid, hasEnded: false)) }
    request.callback(error)
  }
}
private final class CXCallObserver {
  struct Call { let uuid: UUID; let hasEnded: Bool }
  static var observedCalls: [Call] = []
  var calls: [Call] { Self.observedCalls }
}
public final class PKPushRegistry {
  weak var delegate: AnyObject?
  var desiredPushTypes: Set<PKPushType> = []
  var currentToken: Data?
  init(queue: DispatchQueue? = nil) {}
  func pushToken(for type: PKPushType) -> Data? { currentToken }
}
public final class PKPushPayload {
  let dictionaryPayload: [AnyHashable: Any]
  init(_ payload: [String: Any]) { dictionaryPayload = payload }
}
public enum PKPushType: Hashable { case voIP, other }
private final class UIApplication {
  enum State { case active, inactive, background }
  static let shared = UIApplication()
  var applicationState: State = .active
}
private final class UserDefaults {
  static let standard = UserDefaults()
  var storage: [String: Any] = [:]
  func data(forKey key: String) -> Data? { storage[key] as? Data }
  func array(forKey key: String) -> [Any]? { storage[key] as? [Any] }
  func set(_ value: Any?, forKey key: String) { storage[key] = value }
  func removeObject(forKey key: String) { storage.removeValue(forKey: key) }
}
private final class CXAnswerCallAction {
  let callUUID: UUID
  var failed = 0
  init(call: UUID) { callUUID = call }
  func fail() { failed += 1 }
}
private final class CXTransaction {
  let action: CXAnswerCallAction
  init(action: CXAnswerCallAction) { self.action = action }
}
private final class CXCallController {
  var requests: [CXTransaction] = []
  var completions: [(Error?) -> Void] = []
  func request(_ transaction: CXTransaction, completion: @escaping (Error?) -> Void) {
    requests.append(transaction); completions.append(completion)
  }
}
private final class IncomingStateSocketProbe: ChillywoodIncomingCallStateSocket {
  static var created: [IncomingStateSocketProbe] = []
  let request: URLRequest
  var callbacks: [(Result<Data, Error>) -> Void] = []
  var resumed = 0, canceled = 0
  init(request: URLRequest) { self.request=request }
  func resume() { resumed += 1 }
  func receive(_ completion: @escaping (Result<Data, Error>) -> Void) { callbacks.append(completion) }
  func cancel() { canceled += 1 }
  func deliver(_ status: String, sequence: Int = 1, callbackIndex: Int = 0) {
    let fields: [String: Any] = ["observerId": request.value(forHTTPHeaderField: "x-chilly-call-observer")!,
      "connectionId": request.value(forHTTPHeaderField: "x-chilly-call-connection")!,
      "nativeGeneration": request.value(forHTTPHeaderField: "x-chilly-call-generation")!,
      "sequence": sequence, "status": status]
    callbacks[callbackIndex](.success(try! JSONSerialization.data(withJSONObject: fields)))
  }
}
private final class CoordinatorProbe {
  var isBuildEnabled = true
  var isRuntimeDefaultEnabled = true
  var activeCalls: [UUID: ActiveNativeCall] = [:]
  var incomingStateObservers: [UUID: ChillywoodIncomingCallStateObserver] = [:]
  let incomingStateSocketFactory: (URLRequest) -> ChillywoodIncomingCallStateSocket = {
    let socket = IncomingStateSocketProbe(request: $0); IncomingStateSocketProbe.created.append(socket); return socket
  }
  // INSERT_OBSERVER_OWNER
  // INSERT_OBSERVER_CURRENT
  // INSERT_OBSERVER_START
  // INSERT_OBSERVER_TERMINAL
  // INSERT_OBSERVER_STOP_ALL
  var callKitAudioSessionActive = false
  var callKitAudioActivationOwners: [UUID: (generation: UUID, authority: NativeVoipAuthority)] = [:]
  private let audioSessionDiagnostics = ChillywoodNativeCallDiagnostics.shared
  var pendingIncomingReports: [UUID: PendingIncomingReport] = [:]
  var requestedAnswerTransactions: Set<UUID> = []
  var requestedAnswerCompletions: [UUID: [(Result<Void, Error>) -> Void]] = [:]
  var pendingAnswerActions: [UUID: CXAnswerCallAction] = [:]
  var pendingAnswerTimeouts: [UUID: DispatchWorkItem] = [:]
  var requestedEndReasons: [UUID: String] = [:]
  var pendingEvents: [[String: Any]] = []
  var provider: CXProvider? = CXProvider()
  var pushRegistry: PKPushRegistry?
  let callController = CXCallController()
  let stateQueue = DispatchQueue(label: "controlled-incoming-report-state")
  let activeCallsDefaultsKey = "controlled-incoming-report-descriptors"
  let voipAuthorityDefaultsKey = "controlled-incoming-report-authority"
  let terminalInvitesDefaultsKey = "controlled-incoming-report-terminal"
  let pendingEventsDefaultsKey = "controlled-incoming-report-events"
  let pendingAnswerEventsDefaultsKey = "controlled-incoming-report-answer-events"
  var terminalInvites: Set<String> = []
  var events: [[String: Any]] = []
  var eventSink: (([String: Any]) -> Void)?
  var acknowledgments = 0
  var invalidPushes = 0
  var retainedAnswerUuids: Set<UUID> = []
  init() { eventSink = { [weak self] event in self?.events.append(event) } }
  func prepare() {}
  func isTerminalInvite(_ inviteId: String) -> Bool { terminalInvites.contains(inviteId) }
  func markTerminalInvite(_ inviteId: String) { terminalInvites.insert(inviteId) }
  func failPendingAnswer(_ uuid: UUID) { pendingAnswerActions.removeValue(forKey: uuid)?.fail() }
  func settleRequestedAnswers(_ uuid: UUID, result: Result<Void, Error>) {
    requestedAnswerCompletions.removeValue(forKey: uuid)?.forEach { $0(result) }
  }
  func clearPendingAnswerEvent(_ uuid: UUID) {}
  func endAllAnswerTransitionBackgroundTasks() {}
  func endAllTerminalTransitionBackgroundTasks() {}
  func persistPendingAnswerEvent(_ event: [String: Any]) {}
  func retainPendingAnswerEvents(for uuids: Set<UUID>) { retainedAnswerUuids = uuids }
  func acknowledgeIncomingCallPresentation(payload: [String: Any], callUuid: UUID, inviteId: String) {
    acknowledgments += 1
  }
  func reportInvalidVoipPushOnMain(completion: @escaping () -> Void) { invalidPushes += 1; completion() }
  func installAuthority(_ value: NativeVoipAuthority) { persistVoipAuthority(value) }
  func register(_ value: NativeVoipAuthority = authority) throws {
    try startVoipRegistration(userId: value.userId, accountId: value.accountId,
      sessionGeneration: value.sessionGeneration, installId: value.installId)
  }
  func replayToken() { emitCurrentVoipTokenOnMain() }
  func activateAudio() { provider(provider!, didActivate: AVAudioSession.sharedInstance()) }
  func deactivateAudio() { provider(provider!, didDeactivate: AVAudioSession.sharedInstance()) }
  func interruptAudio(_ rawType: UInt) {
    handleAudioSessionInterruption(Notification(name: Notification.Name("controlled-interruption"),
      userInfo: [AVAudioSessionInterruptionTypeKey: rawType]))
  }
  func audioReady(_ uuid: UUID) -> Bool {
    activeCalls[uuid].map { hasCurrentCallKitAudioActivation($0) } ?? false
  }
  func parsedForegroundDate(_ text: String) -> Date? { parseForegroundServerDate(text) }
  func resetAccount() { resetAccountContextOnMain() }
  func restore() { restoreActiveCallDescriptors() }
  func save() { persistActiveCallDescriptors() }
  func remove(_ uuid: UUID) { _ = removeCall(uuid) }
  func report(_ payload: [String: Any], completion: ((Error?) -> Void)? = nil) throws -> UUID {
    try reportIncomingCallOnMain(payload: payload, completion: completion)
  }
  func validated(_ payload: [String: Any], authority: [String: Any]) throws -> [String: Any] {
    try foregroundIncomingPayload(payload, authority: authority)
  }
  func terminal(_ payload: [String: Any]) {
    handleTerminalVoipAction(input: payload, action: "cancel", completion: {})
  }
  func push(_ payload: [String: Any], completion: @escaping () -> Void) {
    pushRegistry(PKPushRegistry(), didReceiveIncomingPushWith: PKPushPayload(payload), for: .voIP, completion: completion)
  }
  // INSERT_FOREGROUND_ENTRY
  // INSERT_FOREGROUND_PAYLOAD
  // INSERT_REQUEST_ANSWER
  // INSERT_START_REGISTRATION
  // INSERT_START_REGISTRY
  // INSERT_RECOVER_CONFIRMED
  // INSERT_REPLAY_TOKEN
  // INSERT_REPORT
  // INSERT_DUPLICATE_PUSH_REPORT
  // INSERT_SETTLE_REPORT
  // INSERT_DRAIN_REPORTS
  // INSERT_REMOVE_CALL
  // INSERT_RESET_ACCOUNT
  // INSERT_RESET_PROVIDER
  // INSERT_TERMINAL
  // INSERT_RESOLVE_UUID
  // INSERT_FIND_CALL
  // INSERT_PUSH
  // INSERT_NORMALIZE_ACTION
  // INSERT_ACTION_LABEL
  // INSERT_TIMEOUT
  // INSERT_PERSIST_CALLS
  // INSERT_RESTORE_CALLS
  // INSERT_VALID_AUTHORITY
  // INSERT_READ_AUTHORITY
  // INSERT_WRITE_AUTHORITY
  // INSERT_MATCH_AUTHORITY
  // INSERT_PARSE_DATE
  // INSERT_PARSE_FOREGROUND_DATE
  // INSERT_TO_TEXT
  // INSERT_EMIT
  // INSERT_RECOVER_AUDIO_READINESS
  // INSERT_RECORD_ACTIVATION
  // INSERT_CURRENT_ACTIVATION
  // INSERT_PROVIDER_ACTIVATE
  // INSERT_PROVIDER_DEACTIVATE
  // INSERT_DEACTIVATE_SESSION
  // INSERT_INTERRUPTION
  // INSERT_DRAIN_EVENTS
  // INSERT_EMIT_RAW
}

private var passed = 0
private func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(label)\n".utf8)); exit(1)
  }
  passed += 1
}
private func expectsFailure(_ label: String, _ action: () throws -> Void) {
  do { try action(); expect(false, label) } catch { passed += 1 }
}
private func pump(_ duration: TimeInterval = 0.035) {
  let until = Date().addingTimeInterval(duration)
  while Date() < until { _ = RunLoop.current.run(mode: .default, before: until) }
}
private func waitUntil(_ label: String, _ condition: () -> Bool) {
  let deadline = Date().addingTimeInterval(2)
  while !condition() && Date() < deadline { pump(0.005) }
  expect(condition(), label)
}
private let authority = NativeVoipAuthority(
  userId: "10000000-0000-4000-8000-000000000001",
  accountId: "10000000-0000-4000-8000-000000000001",
  sessionGeneration: "20000000-0000-4000-8000-000000000001",
  installId: "controlled-install-one"
)
private let replacementAuthority = NativeVoipAuthority(
  userId: "10000000-0000-4000-8000-000000000002",
  accountId: "10000000-0000-4000-8000-000000000002",
  sessionGeneration: "20000000-0000-4000-8000-000000000002",
  installId: "controlled-install-two"
)
private func authorityPayload(_ value: NativeVoipAuthority = authority) -> [String: Any] {
  ["userId": value.userId, "accountId": value.accountId,
   "sessionGeneration": value.sessionGeneration, "installId": value.installId]
}
private func payload(uuid: UUID = UUID(), expiry: TimeInterval = 90, type: String = "voice") -> [String: Any] {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return [
    "callUuid": uuid.uuidString.lowercased(), "callInviteId": uuid.uuidString.lowercased(),
    "threadId": "30000000-0000-4000-8000-000000000001", "callType": type,
    "callerName": "Controlled test caller", "expiresAt": formatter.string(from: Date().addingTimeInterval(expiry)),
    "recipientUserId": authority.userId, "recipientAccountId": authority.accountId,
    "recipientSessionGeneration": authority.sessionGeneration, "recipientInstallId": authority.installId,
  ]
}
private func fresh() -> CoordinatorProbe {
  UserDefaults.standard.storage.removeAll(); CXCallObserver.observedCalls.removeAll()
  UIApplication.shared.applicationState = .active
  let probe = CoordinatorProbe(); probe.installAuthority(authority); return probe
}
private final class CompletionProbe {
  var results: [Error?] = []
  func complete(_ error: Error?) { results.append(error) }
}
private func hasEvent(_ probe: CoordinatorProbe, _ type: String) -> Bool {
  probe.events.contains { $0["type"] as? String == type }
}

// Withhold the actual report callback. Neither provisional ownership nor a
// duplicate request is allowed to impersonate completed CallKit presentation.
private let first = fresh(), firstPayload = payload(type: "video")
private let firstResult = CompletionProbe(), joinedResult = CompletionProbe()
private let firstUuid = try first.report(firstPayload, completion: firstResult.complete)
private let joinedUuid = try first.report(firstPayload, completion: joinedResult.complete)
expect(firstUuid == joinedUuid && first.provider!.requests.count == 1, "pending duplicate joins one exact CallKit report")
expect(firstResult.results.isEmpty && joinedResult.results.isEmpty, "pending duplicate cannot settle before CallKit callback")
expect(first.activeCalls[firstUuid]?.presentationConfirmed == false && first.events.isEmpty,
  "pending ownership emits no presentation receipt")
expect((UserDefaults.standard.array(forKey: first.activeCallsDefaultsKey) ?? []).isEmpty,
  "pending presentation is not persisted as recoverable ownership")
expect(first.provider!.requests[0].update.hasVideo && !first.provider!.requests[0].update.supportsHolding,
  "real incoming callback configures the video descriptor and unsupported controls")
first.provider!.complete(); pump()
expect(firstResult.results.count == 1 && firstResult.results[0] == nil
  && joinedResult.results.count == 1 && joinedResult.results[0] == nil, "successful callback settles every joined waiter exactly once")
expect(first.activeCalls[firstUuid]?.presentationConfirmed == true && hasEvent(first, "incoming"),
  "successful callback establishes confirmed ownership and actual incoming event")
expect(first.acknowledgments == 0, "shared foreground report never creates an APNs acknowledgment")
private let duplicateResult = CompletionProbe()
_ = try first.report(firstPayload, completion: duplicateResult.complete)
pump()
expect(first.provider!.requests.count == 1 && duplicateResult.results.count == 1 && duplicateResult.results[0] == nil,
  "confirmed live duplicate reuses the existing native report")
expect(hasEvent(first, "recovered"), "confirmed live duplicate emits legitimate recovery to rebuild JavaScript ownership")
first.remove(firstUuid)

// Rebinding the same authenticated lifecycle reuses the native registry and
// restores actual confirmed ownership; it neither invents a system call nor
// depends on PushKit issuing another token callback for an unchanged token.
private let rebound = fresh(), reboundInput = payload()
private let reboundUuid = try rebound.report(reboundInput)
rebound.provider!.complete(); pump(); rebound.events.removeAll()
try rebound.register(); pump()
expect(hasEvent(rebound, "recovered") && rebound.provider!.requests.count == 1,
  "same-authority registration restores confirmed native ownership without another CallKit report")
private let retainedRegistry = rebound.pushRegistry!
retainedRegistry.currentToken = Data([0x01, 0xab])
rebound.events.removeAll(); try rebound.register(); pump()
expect(rebound.pushRegistry === retainedRegistry && retainedRegistry.delegate === rebound
  && retainedRegistry.desiredPushTypes == [.voIP], "same-authority rebind retains the configured live PushKit registry")
expect(rebound.events.contains { $0["type"] as? String == "voipTokenUpdated" && $0["token"] as? String == "01ab" },
  "same-authority rebind replays the actual current registry token")
rebound.events.removeAll(); rebound.eventSink = nil; rebound.replayToken(); pump()
expect(rebound.pendingEvents.last?["token"] as? String == "01ab"
  && (UserDefaults.standard.array(forKey: rebound.pendingEventsDefaultsKey) ?? []).isEmpty,
  "unobserved token replay remains memory-only and never enters persisted event storage")
rebound.remove(reboundUuid)

for invalidation in ["absent", "empty", "authority", "registry"] {
  let probe = fresh(); try probe.register(); pump(); probe.events.removeAll()
  probe.pushRegistry!.currentToken = invalidation == "absent" ? nil
    : invalidation == "empty" ? Data() : Data([0x02, 0xcd])
  probe.replayToken()
  if invalidation == "authority" { probe.installAuthority(replacementAuthority) }
  if invalidation == "registry" { probe.pushRegistry = PKPushRegistry() }
  pump()
  expect(!hasEvent(probe, "voipTokenUpdated"), "\(invalidation) token cannot enter the current JavaScript lifecycle")
}

for excluded in ["pending", "ended", "terminal", "authority"] {
  let probe = fresh(), input = payload(), uuid = try probe.report(input)
  if excluded != "pending" { probe.provider!.complete(); pump() }
  probe.events.removeAll()
  if excluded == "ended" { CXCallObserver.observedCalls = [.init(uuid: uuid, hasEnded: true)] }
  if excluded == "terminal" { probe.markTerminalInvite(input["callInviteId"] as! String) }
  if excluded == "authority" { probe.installAuthority(replacementAuthority) }
  try probe.register(excluded == "authority" ? replacementAuthority : authority); pump()
  expect(!hasEvent(probe, "recovered") && probe.provider!.requests.count == 1,
    "registration cannot recover \(excluded) native presentation")
  probe.remove(uuid)
}

private let replacedRegistration = fresh(), replacedRegistrationResult = CompletionProbe()
private let replacedRegistrationUuid = try replacedRegistration.report(payload(), completion: replacedRegistrationResult.complete)
try replacedRegistration.register(); pump()
private let previousRegistry = replacedRegistration.pushRegistry!
try replacedRegistration.register(replacementAuthority); pump()
expect(replacedRegistration.activeCalls[replacedRegistrationUuid] == nil
  && replacedRegistrationResult.results.count == 1 && replacedRegistrationResult.results[0] != nil
  && replacedRegistration.pushRegistry !== previousRegistry && previousRegistry.delegate == nil
  && previousRegistry.desiredPushTypes.isEmpty && !hasEvent(replacedRegistration, "recovered"),
  "account replacement drains old presentation and retires its registry before registering the new owner")

// A foreground presentation can finish before its APNs push arrives. Sharing
// native ownership must not erase the old PushKit delegate's per-push report.
private let foregroundBeforePush = fresh(), foregroundBeforePushInput = payload()
private let foregroundBeforePushUuid = try foregroundBeforePush.report(foregroundBeforePushInput)
foregroundBeforePush.provider!.complete(); pump()
private let foregroundBeforePushGeneration = foregroundBeforePush.activeCalls[foregroundBeforePushUuid]!.generation
private let preservedAnswer = CXAnswerCallAction(call: foregroundBeforePushUuid)
foregroundBeforePush.pendingAnswerActions[foregroundBeforePushUuid] = preservedAnswer
private var foregroundBeforePushCompletions = 0
foregroundBeforePush.push(foregroundBeforePushInput) { foregroundBeforePushCompletions += 1 }
expect(foregroundBeforePush.provider!.requests.count == 2 && foregroundBeforePushCompletions == 0,
  "confirmed foreground then PushKit must issue a second report before completing the push")
expect(foregroundBeforePush.provider!.requests[1].uuid == foregroundBeforePushUuid,
  "duplicate PushKit report retains the exact established UUID")
foregroundBeforePush.provider!.complete(1, error: duplicateIncomingError); pump()
expect(foregroundBeforePushCompletions == 1 && foregroundBeforePush.acknowledgments == 1
  && foregroundBeforePush.activeCalls[foregroundBeforePushUuid]?.generation == foregroundBeforePushGeneration
  && foregroundBeforePush.provider!.ended.isEmpty && preservedAnswer.failed == 0,
  "expected duplicate rejection preserves established ownership and pending Answer")
foregroundBeforePush.provider!.complete(1, error: duplicateIncomingError); pump()
expect(foregroundBeforePushCompletions == 1 && foregroundBeforePush.acknowledgments == 1,
  "duplicate OS callback cannot complete or acknowledge one push twice")
foregroundBeforePush.remove(foregroundBeforePushUuid)

// Execute the actual PushKit wrapper in both arrival orders. Foreground-only
// waiters share ownership; every separate PushKit ingress issues its report.
for pushFirst in [false, true] {
  let probe = fresh(), input = payload(), foreground = CompletionProbe()
  var pushCompletions = 0
  let safe = try probe.validated(input, authority: authorityPayload())
  if pushFirst { probe.push(input) { pushCompletions += 1 } }
  _ = try probe.report(safe, completion: foreground.complete)
  if !pushFirst { probe.push(input) { pushCompletions += 1 } }
  expect(probe.provider!.requests.count == (pushFirst ? 1 : 2) && foreground.results.isEmpty && pushCompletions == 0
    && probe.acknowledgments == 0, "both arrival orders retain the per-push report obligation")
  probe.provider!.complete(); pump()
  if !pushFirst {
    expect(pushCompletions == 0 && probe.acknowledgments == 0,
      "original report success cannot complete a later push before its own report callback")
    probe.provider!.complete(1, error: duplicateIncomingError); pump()
  }
  expect(foreground.results.count == 1 && foreground.results[0] == nil && pushCompletions == 1
    && probe.acknowledgments == 1, "genuine joined push acknowledges only confirmed presentation")
  var wrongPush = input; wrongPush["recipientInstallId"] = "stale-install"
  probe.push(wrongPush) { pushCompletions += 1 }
  expect(probe.invalidPushes == 1 && probe.acknowledgments == 1 && probe.provider!.requests.count == (pushFirst ? 1 : 2),
    "stale push authority cannot borrow confirmed foreground ownership or acknowledge it")
  probe.remove(UUID(uuidString: input["callUuid"] as! String)!)
}

// Both independent CallKit callbacks can arrive in either order. A duplicate
// error cannot substitute for the original presentation, and a successful
// duplicate must not leave an orphan when the original report is rejected.
for duplicateFirst in [false, true] {
  for primaryFails in [false, true] {
    for duplicateOutcome in ["exists", "success", "rejected", "wrong-domain"] {
      let probe = fresh(), input = payload(), primary = CompletionProbe()
      let uuid = try probe.report(input, completion: primary.complete)
      let generation = probe.activeCalls[uuid]!.generation
      var completions = 0
      probe.push(input) { completions += 1 }
      expect(probe.provider!.requests.count == 2 && completions == 0,
        "pending foreground plus PushKit issues a distinct mandatory report")
      let duplicateError: Error?
      switch duplicateOutcome {
      case "exists": duplicateError = duplicateIncomingError
      case "success": duplicateError = nil
      case "wrong-domain": duplicateError = NSError(domain: "unrelated", code: 2)
      default: duplicateError = ReportProbeError.rejected
      }
      func primaryCallback() { probe.provider!.complete(0, error: primaryFails ? ReportProbeError.rejected : nil); pump() }
      func duplicateCallback() { probe.provider!.complete(1, error: duplicateError); pump() }
      if duplicateFirst { duplicateCallback() } else { primaryCallback() }
      expect(completions == 0 && probe.acknowledgments == 0,
        "one callback cannot settle a push joined to an unconfirmed original report")
      if duplicateFirst { primaryCallback() } else { duplicateCallback() }
      let shouldAcknowledge = !primaryFails && ["exists", "success"].contains(duplicateOutcome)
      expect(completions == 1 && probe.acknowledgments == (shouldAcknowledge ? 1 : 0),
        "only exact duplicate success plus confirmed original ownership may acknowledge")
      if primaryFails {
        expect(probe.activeCalls[uuid] == nil && primary.results.count == 1 && primary.results[0] != nil,
          "duplicate report never reverses original presentation failure")
        expect(probe.provider!.ended.count == (duplicateOutcome == "success" ? 1 : 0),
          "successful duplicate after failed original closes only its orphan")
      } else {
        expect(probe.activeCalls[uuid]?.generation == generation && probe.provider!.ended.isEmpty
          && primary.results.count == 1 && primary.results[0] == nil,
          "duplicate failure never removes or ends a healthy original presentation")
      }
      probe.remove(uuid)
    }
  }
}

// Every duplicate notification has its own obligation; one completed duplicate
// cannot prematurely complete a second notification for the same live UUID.
private let repeatedPush = fresh(), repeatedInput = payload()
private var repeatedCompletions = 0
repeatedPush.push(repeatedInput) { repeatedCompletions += 1 }
repeatedPush.provider!.complete(); pump()
for _ in 0..<2 { repeatedPush.push(repeatedInput) { repeatedCompletions += 1 } }
expect(repeatedPush.provider!.requests.count == 3 && repeatedCompletions == 1,
  "each repeated VoIP notification receives a distinct CallKit report")
repeatedPush.provider!.complete(2, error: duplicateIncomingError); pump()
expect(repeatedCompletions == 2, "out-of-order duplicate callback completes only its own notification")
repeatedPush.provider!.complete(1, error: duplicateIncomingError); pump()
expect(repeatedCompletions == 3 && repeatedPush.acknowledgments == 3 && repeatedPush.provider!.ended.isEmpty,
  "repeated legitimate notifications neither lose completion nor end the live call")
repeatedPush.remove(UUID(uuidString: repeatedInput["callUuid"] as! String)!)

// Current dispatch forbids terminal VoIP payloads, but a legacy delivery must
// still satisfy the old delegate contract after bounded terminal cleanup.
for terminalState in ["live", "already-terminal", "unknown"] {
  let probe = fresh()
  var input = payload()
  let uuid = UUID(uuidString: input["callUuid"] as! String)!
  if terminalState == "live" {
    _ = try probe.report(input); probe.provider!.complete(); pump()
  } else if terminalState == "already-terminal" {
    probe.markTerminalInvite(input["callInviteId"] as! String)
  }
  let unrelatedInput = payload(), unrelatedUuid = try probe.report(unrelatedInput)
  probe.provider!.complete(probe.provider!.requests.count - 1); pump()
  let unrelatedGeneration = probe.activeCalls[unrelatedUuid]!.generation
  let unrelatedAnswer = CXAnswerCallAction(call: unrelatedUuid)
  probe.pendingAnswerActions[unrelatedUuid] = unrelatedAnswer
  input["callAction"] = "cancel"
  var completions = 0
  probe.push(input) { completions += 1 }
  expect(probe.invalidPushes == 1 && completions == 1 && probe.acknowledgments == 0,
    "legacy terminal push retains failed-report obligation regardless of prior call inventory")
  expect(probe.activeCalls[uuid] == nil,
    "legacy terminal report obligation does not resurrect the original call")
  expect(probe.activeCalls[unrelatedUuid]?.generation == unrelatedGeneration
    && probe.activeCalls[unrelatedUuid]?.presentationConfirmed == true && unrelatedAnswer.failed == 0
    && !probe.provider!.ended.contains(unrelatedUuid),
    "terminal reconciliation preserves unrelated native generation and pending Answer")
  probe.remove(unrelatedUuid)
}

for conflictingField in ["callUuid", "invalid-uuid", "callInviteId", "threadId", "callType", "authority", "missing-thread", "missing-invite"] {
  let probe = fresh(), original = payload()
  let uuid = try probe.report(original)
  probe.provider!.complete(); pump()
  let generation = probe.activeCalls[uuid]!.generation
  let answer = CXAnswerCallAction(call: uuid)
  probe.pendingAnswerActions[uuid] = answer
  var conflicting = original
  if conflictingField == "authority" {
    probe.installAuthority(replacementAuthority)
  } else if conflictingField == "invalid-uuid" {
    conflicting["callUuid"] = "invalid-uuid"
  } else if conflictingField == "missing-thread" || conflictingField == "missing-invite" {
    conflicting[conflictingField == "missing-thread" ? "threadId" : "callInviteId"] = ""
  } else {
    conflicting[conflictingField] = conflictingField == "callType" ? "video" : UUID().uuidString.lowercased()
  }
  probe.terminal(conflicting)
  expect(probe.activeCalls[uuid]?.generation == generation && probe.provider!.ended.isEmpty
    && answer.failed == 0 && !probe.isTerminalInvite(original["callInviteId"] as! String)
    && !probe.isTerminalInvite(conflicting["callInviteId"] as! String),
    "terminal UUID lookup cannot override exact invite, thread, media type, or native authority")
  probe.remove(uuid)
}

// Retiring native ownership while a duplicate callback is pending must not
// borrow a same-UUID replacement, an altered authority, or an ended system call.
for invalidation in ["remove", "account", "provider", "authority", "replacement", "system-ended"] {
  for duplicateSucceeds in [false, true] {
    let probe = fresh(), input = payload()
    let uuid = try probe.report(input)
    probe.provider!.complete(); pump()
    var completions = 0
    probe.push(input) { completions += 1 }
    switch invalidation {
    case "account": probe.resetAccount(); probe.installAuthority(replacementAuthority)
    case "provider": probe.providerDidReset(probe.provider!)
    case "authority": probe.installAuthority(replacementAuthority)
    case "replacement":
      probe.remove(uuid); _ = try probe.report(input)
      probe.provider!.complete(2); pump()
    case "system-ended": CXCallObserver.observedCalls.removeAll { $0.uuid == uuid }
    default: probe.remove(uuid)
    }
    let replacementGeneration = probe.activeCalls[uuid]?.generation
    let endedBefore = probe.provider!.ended.count
    probe.provider!.complete(1, error: duplicateSucceeds ? nil : duplicateIncomingError)
    if invalidation == "system-ended" { CXCallObserver.observedCalls.removeAll { $0.uuid == uuid } }
    pump()
    expect(completions == 1 && probe.acknowledgments == 0,
      "retired or unobserved ownership cannot authorize late duplicate acknowledgement")
    if invalidation == "replacement" {
      expect(probe.activeCalls[uuid]?.generation == replacementGeneration
        && probe.activeCalls[uuid]?.presentationConfirmed == true && probe.provider!.ended.count == endedBefore,
        "late duplicate receipt cannot confirm or end a replacement native generation")
    }
    probe.remove(uuid)
  }
}

// Rejection keeps the actual error and clears provisional ownership. A fresh
// invite can subsequently present normally.
private let failed = fresh(), failedResult = CompletionProbe(), failedJoin = CompletionProbe()
private let failedPayload = payload(), failedUuid = try failed.report(failedPayload, completion: failedResult.complete)
_ = try failed.report(failedPayload, completion: failedJoin.complete)
failed.provider!.complete(error: ReportProbeError.rejected); pump()
expect(failedResult.results.count == 1 && failedResult.results[0] is ReportProbeError
  && failedJoin.results.count == 1 && failedJoin.results[0] is ReportProbeError,
  "CallKit rejection propagates to every exact pending waiter")
expect(failed.activeCalls[failedUuid] == nil && failed.pendingIncomingReports.isEmpty && !hasEvent(failed, "incoming"),
  "rejected report cannot retain presentation or emit success")
private let recoveryResult = CompletionProbe(), recoveryUuid = try failed.report(payload(), completion: recoveryResult.complete)
failed.provider!.complete(1); pump()
expect(recoveryResult.results.count == 1 && recoveryResult.results[0] == nil, "fresh incoming invite works after report failure")
failed.remove(recoveryUuid)

// Conflicting descriptors cannot acquire a pending or confirmed operation.
for confirmed in [false, true] {
  let probe = fresh(), original = payload(), result = CompletionProbe()
  let uuid = try probe.report(original, completion: result.complete)
  if confirmed { probe.provider!.complete(); pump() }
  for (key, value) in [
    ("callInviteId", UUID().uuidString.lowercased()),
    ("threadId", UUID().uuidString.lowercased()),
    ("callType", "video"),
  ] {
    var conflicting = original; conflicting[key] = value
    expectsFailure("conflicting \(key) cannot borrow existing native presentation") { _ = try probe.report(conflicting) }
  }
  expect(probe.provider!.requests.count == 1 && probe.activeCalls[uuid]?.inviteId == original["callInviteId"] as? String,
    "rejected conflicts preserve the original CallKit operation")
  probe.installAuthority(replacementAuthority)
  expectsFailure("replacement persisted authority cannot borrow existing native presentation") { _ = try probe.report(original) }
  probe.remove(uuid)
}

// Exercise actual terminal/reset/removal callbacks while the provider callback
// is withheld; the late callback must not resurrect state or settle twice.
for terminal in ["remote", "remove", "account", "provider"] {
  let probe = fresh(), input = payload(), result = CompletionProbe(), joined = CompletionProbe()
  let uuid = try probe.report(input, completion: result.complete)
  _ = try probe.report(input, completion: joined.complete)
  switch terminal {
  case "remote": probe.terminal(input)
  case "account": probe.resetAccount(); probe.installAuthority(replacementAuthority)
  case "provider": probe.providerDidReset(probe.provider!)
  default: probe.remove(uuid)
  }
  expect(result.results.count == 1 && result.results[0] != nil && joined.results.count == 1 && joined.results[0] != nil,
    "\(terminal) settles every pending report before the OS callback arrives")
  probe.provider!.complete(); pump()
  expect(result.results.count == 1 && joined.results.count == 1 && probe.activeCalls[uuid] == nil
    && probe.pendingIncomingReports.isEmpty && !hasEvent(probe, "incoming"),
    "late callback after \(terminal) cannot resurrect or settle twice")
  probe.installAuthority(authority)
  let nextResult = CompletionProbe(), nextUuid = try probe.report(payload(), completion: nextResult.complete)
  probe.provider!.complete(1); pump()
  expect(nextResult.results.count == 1 && nextResult.results[0] == nil,
    "fresh invite remains usable after \(terminal) cleanup and its late callback")
  probe.remove(nextUuid)
}

// A same-UUID replacement must survive the retired generation's success or
// failure callback; no old waiter may consume the replacement's settlement.
for staleError in [false, true] {
  let probe = fresh(), input = payload(), retired = CompletionProbe(), current = CompletionProbe()
  let uuid = try probe.report(input, completion: retired.complete)
  probe.remove(uuid)
  _ = try probe.report(input, completion: current.complete)
  let generation = probe.activeCalls[uuid]!.generation
  let endedBefore = probe.provider!.ended.count
  probe.provider!.complete(error: staleError ? ReportProbeError.rejected : nil); pump()
  expect(retired.results.count == 1 && current.results.isEmpty
    && probe.activeCalls[uuid]?.generation == generation && probe.activeCalls[uuid]?.presentationConfirmed == false
    && probe.provider!.ended.count == endedBefore, "retired generation callback cannot settle, confirm, or end its replacement")
  probe.provider!.complete(1); pump()
  expect(current.results.count == 1 && current.results[0] == nil, "replacement settles only from its own report callback")
  probe.remove(uuid)
}

// A completion may synchronously cancel the call. Removal must have detached
// the report's waiters before executing them, preventing double resumption.
private let reentrant = fresh(), reentrantInput = payload(), reentrantJoined = CompletionProbe()
private var reentrantCount = 0
private let reentrantUuid = UUID(uuidString: reentrantInput["callUuid"] as! String)!
_ = try reentrant.report(reentrantInput) { _ in reentrantCount += 1; reentrant.remove(reentrantUuid) }
_ = try reentrant.report(reentrantInput, completion: reentrantJoined.complete)
reentrant.provider!.complete(); pump()
expect(reentrantCount == 1 && reentrantJoined.results.count == 1 && reentrant.pendingIncomingReports.isEmpty,
  "reentrant terminal completion cannot double-settle detached waiter list")
expect(!hasEvent(reentrant, "incoming"), "queued incoming event cannot outlive reentrant terminal cleanup")

for invalidation in ["account", "provider", "authority"] {
  let probe = fresh(), input = payload()
  _ = try probe.report(input) { error in
    guard error == nil else { return }
    switch invalidation {
    case "account": probe.resetAccount(); probe.installAuthority(replacementAuthority)
    case "provider": probe.providerDidReset(probe.provider!)
    default: probe.installAuthority(replacementAuthority)
    }
  }
  probe.provider!.complete(); pump()
  expect(!hasEvent(probe, "incoming"), "queued incoming event cannot cross \(invalidation) replacement")
  probe.remove(UUID(uuidString: input["callUuid"] as! String)!)
}

// The real ringing timer also bounds a CallKit callback that never arrives.
private let expiring = fresh(), expiringResult = CompletionProbe()
private let expiringUuid = try expiring.report(payload(expiry: 0.5), completion: expiringResult.complete)
// Settlement occurs inside removeCall; emitRaw delivers the timeout receipt on
// a subsequent main-queue turn. Observe the complete terminal receipt instead
// of racing it immediately after the continuation has settled.
waitUntil("pending incoming report expires without a provider callback") {
  !expiringResult.results.isEmpty && expiring.activeCalls[expiringUuid] == nil && hasEvent(expiring, "timeout")
}
expect(expiringResult.results.count == 1 && expiringResult.results[0] != nil
  && expiring.activeCalls[expiringUuid] == nil && hasEvent(expiring, "timeout"),
  "authoritative deadline settles pending presentation and removes ownership")
expiring.provider!.complete(); pump()
expect(expiringResult.results.count == 1 && !hasEvent(expiring, "incoming"),
  "report success after expiry cannot revive presentation")

// Test actual persistence and restore. A system UUID cannot promote a pending
// descriptor; confirmed recovery requires a current, unended OS call.
private let persistence = fresh(), persistedInput = payload(), persistedResult = CompletionProbe()
private let persistedUuid = try persistence.report(persistedInput, completion: persistedResult.complete)
persistence.save()
CXCallObserver.observedCalls = [.init(uuid: persistedUuid, hasEnded: false)]
private let pendingRestore = CoordinatorProbe()
pendingRestore.restore()
expect(pendingRestore.activeCalls.isEmpty && !hasEvent(pendingRestore, "recovered"),
  "pending presentation never becomes recovered state after process restart")
persistence.provider!.complete(); pump()
private let confirmedRestore = CoordinatorProbe()
confirmedRestore.restore()
pump()
expect(confirmedRestore.activeCalls[persistedUuid]?.presentationConfirmed == true && hasEvent(confirmedRestore, "recovered"),
  "persisted confirmed descriptor plus live system call restores actual native ownership")
CXCallObserver.observedCalls = [.init(uuid: persistedUuid, hasEnded: true)]
private let endedRestore = CoordinatorProbe()
endedRestore.restore()
pump()
expect(endedRestore.activeCalls.isEmpty && !hasEvent(endedRestore, "recovered"),
  "ended system call cannot restore native presentation")
expectsFailure("confirmed duplicate rejects ended system inventory") { _ = try persistence.report(persistedInput) }
persistence.remove(persistedUuid); confirmedRestore.remove(persistedUuid)

// Foreground authority checks run inside the actual main-queue method.
private let validation = fresh(), validPayload = payload()
for invalid in [
  "2026-02-30T12:00:00Z", "2025-02-29T12:00:00Z", "1900-02-29T12:00:00Z",
  "2026-04-31T12:00:00Z", "0000-01-01T12:00:00Z", "2026-00-01T12:00:00Z",
  "2026-13-01T12:00:00Z", "2026-01-00T12:00:00Z", "2026-01-01T24:00:00Z",
  "2026-01-01T12:60:00Z", "2026-01-01T12:00:60Z", "2026-01-01T12:00:00+24:00",
  "2026-01-01T12:00:00+01:60", "2026-01-01T12:00:00.1234567Z", "2026-01-01",
  "2026-01-01T12:00:00Z trailing", "2026-01-01T12:00:00Z\n", "",
] {
  expect(validation.parsedForegroundDate(invalid) == nil, "foreground date parser rejects invalid calendar/format: \(invalid)")
}
for valid in ["2024-02-29T12:00:00Z", "2000-02-29T12:00:00Z", "2026-10-08T12:00:00.123456Z",
  "2026-10-08T12:00:00-05:00", "2026-10-08T12:00:00+05:30"] {
  expect(validation.parsedForegroundDate(valid) != nil, "foreground date parser accepts valid calendar/offset: \(valid)")
}
_ = try validation.validated(validPayload, authority: authorityPayload())
for gate in ["build", "runtime"] {
  validation.isBuildEnabled = gate != "build"
  validation.isRuntimeDefaultEnabled = gate != "runtime"
  expectsFailure("foreground requires enabled \(gate) gate") {
    _ = try validation.validated(validPayload, authority: authorityPayload())
  }
}
validation.isBuildEnabled = true; validation.isRuntimeDefaultEnabled = true
for state in [UIApplication.State.inactive, .background] {
  UIApplication.shared.applicationState = state
  expectsFailure("inactive/background foreground request is rejected") {
    _ = try validation.validated(validPayload, authority: authorityPayload())
  }
}
UIApplication.shared.applicationState = .active
for key in ["userId", "accountId", "sessionGeneration", "installId"] {
  var wrongAuthority = authorityPayload(); wrongAuthority[key] = "wrong-current-owner"
  expectsFailure("foreground \(key) must equal persisted authority") {
    _ = try validation.validated(validPayload, authority: wrongAuthority)
  }
}
for (key, value) in [("callUuid", UUID().uuidString.lowercased()), ("threadId", "invalid"), ("callType", "invalid")] {
  var invalid = validPayload; invalid[key] = value
  expectsFailure("foreground \(key) must retain exact valid descriptor") { _ = try validation.validated(invalid, authority: authorityPayload()) }
}
expectsFailure("expired foreground invite is rejected before presentation") {
  _ = try validation.validated(payload(expiry: -1), authority: authorityPayload())
}
expect(validation.provider!.requests.isEmpty, "invalid foreground inputs never reach CallKit")
private var capabilityInput = validPayload
capabilityInput["presentationAckToken"] = String(repeating: "a", count: 43)
capabilityInput["presentationAttemptId"] = UUID().uuidString
capabilityInput["presentationAckUrl"] = "https://example.invalid/"
private let sanitized = try validation.validated(capabilityInput, authority: authorityPayload())
expect(sanitized["presentationAckToken"] == nil && sanitized["presentationAttemptId"] == nil
  && sanitized["presentationAckUrl"] == nil, "foreground payload strips every acknowledgment capability field")

// Call the actual asynchronous bridge entry. A fulfilled enqueue is not a
// completed presentation; the return value waits for the held OS callback.
private final class AsyncOutcome {
  var value: String?
  var error: Error?
  var settled = false
}
private let pendingAnswer = fresh(), pendingAnswerInput = payload(), pendingAnswerOutcome = AsyncOutcome()
private let pendingAnswerUuid = try pendingAnswer.report(pendingAnswerInput)
Task { @MainActor in
  do {
    try await pendingAnswer.requestAnswer(callUuid: pendingAnswerUuid.uuidString,
      inviteId: pendingAnswerInput["callInviteId"] as! String)
  } catch { pendingAnswerOutcome.error = error }
  pendingAnswerOutcome.settled = true
}
waitUntil("actual Answer entry evaluates unconfirmed incoming report") {
  pendingAnswerOutcome.settled || !pendingAnswer.callController.requests.isEmpty
}
expect(pendingAnswerOutcome.error != nil && pendingAnswer.callController.requests.isEmpty,
  "unconfirmed presentation cannot submit a native Answer transaction")
pendingAnswer.remove(pendingAnswerUuid)

private let confirmedAnswer = fresh(), confirmedAnswerInput = payload(), confirmedAnswerOutcome = AsyncOutcome()
private let confirmedAnswerUuid = try confirmedAnswer.report(confirmedAnswerInput)
confirmedAnswer.provider!.complete(); pump()
Task { @MainActor in
  do {
    try await confirmedAnswer.requestAnswer(callUuid: confirmedAnswerUuid.uuidString,
      inviteId: confirmedAnswerInput["callInviteId"] as! String)
  } catch { confirmedAnswerOutcome.error = error }
  confirmedAnswerOutcome.settled = true
}
waitUntil("actual Answer entry requests a transaction for confirmed presentation") {
  confirmedAnswer.callController.requests.count == 1
}
expect(!confirmedAnswerOutcome.settled, "Answer waits for its native delegate rather than transaction submission")
confirmedAnswer.remove(confirmedAnswerUuid)
waitUntil("terminal cleanup settles the confirmed Answer request") { confirmedAnswerOutcome.settled }
expect(confirmedAnswerOutcome.error != nil, "removed presentation cannot retain a pending Answer continuation")

private let asynchronous = fresh(), asyncInput = payload(), asyncOutcome = AsyncOutcome()
Task { @MainActor in
  do { asyncOutcome.value = try await asynchronous.reportForegroundIncomingCall(payload: asyncInput, authority: authorityPayload()) }
  catch { asyncOutcome.error = error }
  asyncOutcome.settled = true
}
waitUntil("async foreground entry reaches the native report seam") { asynchronous.provider!.requests.count == 1 }
expect(!asyncOutcome.settled, "foreground bridge promise remains pending before CallKit completion")
asynchronous.provider!.complete()
waitUntil("async foreground entry settles after actual CallKit completion") {
  asyncOutcome.settled && (asyncOutcome.error != nil || hasEvent(asynchronous, "incoming"))
}
expect(asyncOutcome.error == nil && asyncOutcome.value == asyncInput["callUuid"] as? String
  && hasEvent(asynchronous, "incoming"), "async foreground returns exact confirmed UUID and emits genuine native ownership")
asynchronous.remove(UUID(uuidString: asyncInput["callUuid"] as! String)!)

for invalidation in ["background", "authority", "terminal"] {
  let probe = fresh(), input = payload(), outcome = AsyncOutcome()
  Task { @MainActor in
    do { outcome.value = try await probe.reportForegroundIncomingCall(payload: input, authority: authorityPayload()) }
    catch { outcome.error = error }
    outcome.settled = true
  }
  waitUntil("foreground pending setup before \(invalidation)") { probe.provider!.requests.count == 1 }
  switch invalidation {
  case "background": UIApplication.shared.applicationState = .background
  case "authority": probe.installAuthority(replacementAuthority)
  default: probe.terminal(input)
  }
  probe.provider!.complete()
  waitUntil("foreground entry rejects after \(invalidation) during report") { outcome.settled }
  expect(outcome.error != nil && outcome.value == nil,
    "callback cannot grant foreground Answer after \(invalidation)")
  if invalidation != "background" {
    expect(probe.activeCalls[UUID(uuidString: input["callUuid"] as! String)!] == nil && !hasEvent(probe, "incoming"),
      "invalidated \(invalidation) ownership cannot remain presented after delayed success")
  }
  probe.remove(UUID(uuidString: input["callUuid"] as! String)!)
}

// Execute the actual activation delegate and asynchronous native event emitter.
// Controlled CallKit inventory and AVAudioSession receipts establish source
// causality, not audible media or delivery of a physical system callback.
private func confirmedAnsweredCall() throws -> (CoordinatorProbe, [String: Any], UUID) {
  let probe = fresh(), input = payload()
  let uuid = try probe.report(input)
  probe.provider!.complete(); pump()
  probe.activeCalls[uuid]!.answered = true
  probe.save()
  probe.events.removeAll()
  return (probe, input, uuid)
}
private func nativeEvent(_ probe: CoordinatorProbe, _ uuid: UUID, type: String) -> [String: Any] {
  let call = probe.activeCalls[uuid]!
  return ["type": type, "callUuid": uuid.uuidString.lowercased(), "callInviteId": call.inviteId,
    "threadId": call.threadId, "callType": call.callType,
    "nativeCallGeneration": call.generation.uuidString.lowercased(),
    "nativeSessionGeneration": authority.sessionGeneration]
}
private func replaceGeneration(_ probe: CoordinatorProbe, _ uuid: UUID) {
  let old = probe.activeCalls[uuid]!
  probe.activeCalls[uuid] = ActiveNativeCall(uuid: old.uuid, inviteId: old.inviteId, threadId: old.threadId,
    callType: old.callType, ringingDeadline: old.ringingDeadline, answered: old.answered,
    timeoutWorkItem: nil, presentationConfirmed: true, presentationAuthority: old.presentationAuthority)
}

private let (liveAudio, _, liveAudioUuid) = try confirmedAnsweredCall()
liveAudio.activateAudio(); pump()
private let liveActivation = liveAudio.events.filter { $0["type"] as? String == "audioSessionActivated" }
expect(liveActivation.count == 1 && liveActivation[0]["callUuid"] as? String == liveAudioUuid.uuidString.lowercased()
  && liveActivation[0]["callInviteId"] as? String == liveAudio.activeCalls[liveAudioUuid]?.inviteId,
  "live activation emits the exact answered presentation only")
expect(liveActivation[0]["nativeCallGeneration"] as? String == liveAudio.activeCalls[liveAudioUuid]?.generation.uuidString.lowercased()
  && liveActivation[0]["nativeSessionGeneration"] as? String == authority.sessionGeneration,
  "live activation carries opaque current call and session generations")
expect(liveAudio.audioReady(liveAudioUuid), "actual delegate creates native readiness for its exact owner")
liveAudio.events.removeAll(); try liveAudio.register(); pump()
private let readyRecovery = liveAudio.events.filter { $0["type"] as? String == "recovered" }
expect(readyRecovery.count == 1 && readyRecovery[0]["audioSessionActive"] as? Bool == true,
  "same-owner registration recovery reports current active readiness")
expect(readyRecovery[0]["nativeCallGeneration"] as? String == liveAudio.activeCalls[liveAudioUuid]?.generation.uuidString.lowercased()
  && readyRecovery[0]["nativeSessionGeneration"] as? String == authority.sessionGeneration,
  "recovered readiness carries its exact current native generations")
liveAudio.events.removeAll(); try liveAudio.register(); liveAudio.deactivateAudio(); pump()
private let deactivatedRecovery = liveAudio.events.filter { $0["type"] as? String == "recovered" }
expect(deactivatedRecovery.count == 1 && deactivatedRecovery[0]["audioSessionActive"] as? Bool == false,
  "queued recovered presentation recomputes readiness after deactivation before delivery")
liveAudio.activateAudio(); pump()
liveAudio.remove(liveAudioUuid)
expect(liveAudio.callKitAudioActivationOwners.isEmpty,
  "exact call removal discards its activation owner")

// emitRaw enqueues onto main; invalidate before pumping that queue. A positive
// receipt queued by didActivate must not authorize an owner that disappeared.
for invalidation in ["deactivation", "interruption", "authority", "generation", "terminal", "account", "provider", "ended"] {
  let (probe, input, uuid) = try confirmedAnsweredCall()
  probe.activateAudio()
  expect(probe.events.isEmpty, "activation delivery is held until the native main queue executes")
  switch invalidation {
  case "deactivation": probe.deactivateAudio()
  case "interruption": probe.interruptAudio(UInt(1))
  case "authority": probe.installAuthority(replacementAuthority)
  case "generation": replaceGeneration(probe, uuid)
  case "terminal": probe.terminal(input)
  case "account": probe.resetAccount(); probe.installAuthority(replacementAuthority)
  case "provider": probe.providerDidReset(probe.provider!)
  default: CXCallObserver.observedCalls = [.init(uuid: uuid, hasEnded: true)]
  }
  pump()
  expect(!hasEvent(probe, "audioSessionActivated"),
    "queued positive activation cannot survive \(invalidation) before delivery")
  expect(!probe.audioReady(uuid), "\(invalidation) cannot retain positive native ownership")
  if ["terminal", "account", "provider"].contains(invalidation) {
    expect(probe.callKitAudioActivationOwners.isEmpty,
      "\(invalidation) clears the retired activation owner")
  }
  probe.remove(uuid)
}

// No listener: neither queue is allowed to store a positive activation. A new
// listener obtains readiness from a new exact recovered presentation instead.
private let (detachedAudio, _, detachedAudioUuid) = try confirmedAnsweredCall()
detachedAudio.eventSink = nil
detachedAudio.activateAudio(); pump()
private let detachedDurable = UserDefaults.standard.array(forKey: detachedAudio.pendingEventsDefaultsKey) as? [[String: Any]] ?? []
expect(!detachedDurable.contains { $0["type"] as? String == "audioSessionActivated" }
  && !detachedAudio.pendingEvents.contains { $0["type"] as? String == "audioSessionActivated" },
  "listener absence cannot persist or queue a historical positive activation")
expect(detachedAudio.drainPendingEvents().isEmpty,
  "reattaching cannot drain a positive activation that happened without a listener")
detachedAudio.eventSink = { event in detachedAudio.events.append(event) }
try detachedAudio.register(); pump()
expect(detachedAudio.events.contains { $0["type"] as? String == "recovered" && $0["audioSessionActive"] as? Bool == true },
  "reattached listener receives current readiness through recovered ownership")

// Defensively reject historical positives from both queue locations, including
// data written by older application versions. Recovered snapshots are sampled
// at delivery/drain time, never copied from a stored readiness bit.
private var historicalActivation = nativeEvent(detachedAudio, detachedAudioUuid, type: "audioSessionActivated")
historicalActivation["audioSessionActive"] = true
UserDefaults.standard.set([historicalActivation], forKey: detachedAudio.pendingEventsDefaultsKey)
detachedAudio.pendingEvents = [historicalActivation]
expect(detachedAudio.drainPendingEvents().isEmpty,
  "draining rejects historical positive activation from both durable and memory queues")
private var historicalRecovery = nativeEvent(detachedAudio, detachedAudioUuid, type: "recovered")
historicalRecovery["audioSessionActive"] = true
UserDefaults.standard.set([historicalRecovery], forKey: detachedAudio.pendingEventsDefaultsKey)
private let activeDrained = detachedAudio.drainPendingEvents()
expect(activeDrained.count == 1 && activeDrained[0]["audioSessionActive"] as? Bool == true,
  "drained same-owner recovery computes a currently active session")
detachedAudio.deactivateAudio(); pump()
UserDefaults.standard.set([historicalRecovery], forKey: detachedAudio.pendingEventsDefaultsKey)
private let inactiveDrained = detachedAudio.drainPendingEvents()
expect(inactiveDrained.count == 1 && inactiveDrained[0]["audioSessionActive"] as? Bool == false,
  "drained recovery cannot retain a stored positive readiness field")

// Persist only confirmed call descriptors, then instantiate a new coordinator
// while the OS still reports the UUID. Process-memory activation must be gone.
detachedAudio.activateAudio(); pump(); detachedAudio.save()
private let coldAudio = CoordinatorProbe()
coldAudio.restore(); pump()
expect(coldAudio.activeCalls[detachedAudioUuid]?.answered == true && !coldAudio.audioReady(detachedAudioUuid),
  "cold restore preserves answered presentation without restoring activation")
private let coldRecovered = coldAudio.events.filter { $0["type"] as? String == "recovered" }
expect(coldRecovered.count == 1 && coldRecovered[0]["audioSessionActive"] as? Bool == false,
  "cold restored presentation reports current inactive readiness")
expect(coldAudio.callKitAudioActivationOwners.isEmpty && !coldAudio.callKitAudioSessionActive,
  "activation ownership remains process-memory state")
UserDefaults.standard.set([historicalRecovery], forKey: coldAudio.pendingEventsDefaultsKey)
private let coldDrained = coldAudio.drainPendingEvents()
expect(coldDrained.count == 1 && coldDrained[0]["audioSessionActive"] as? Bool == false,
  "cold drained recovery cannot inherit another native generation's activation")
coldAudio.remove(detachedAudioUuid); detachedAudio.remove(detachedAudioUuid)

private func observerPayload() -> [String: Any] {
  var value=payload()
  let formatter=ISO8601DateFormatter(); formatter.formatOptions=[.withInternetDateTime, .withFractionalSeconds]
  let expiry=formatter.date(from:value["expiresAt"] as! String)!
  value["stateObserverVersion"]=1; value["stateObserverId"]=UUID().uuidString
  value["stateObserverCapability"]=String(repeating:"Z",count:43)
  value["stateObserverUrl"]="wss://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state"
  value["stateObserverExpiresAtMillis"]=String(Int64((expiry.timeIntervalSince1970*1000).rounded()))
  return value
}
for terminal in ["canceled", "declined", "missed", "ended", "accepted"] {
  let probe=fresh(), input=observerPayload(), uuid=UUID(uuidString:input["callUuid"] as! String)!
  let before=IncomingStateSocketProbe.created.count
  var completion=0
  probe.pushRegistry(PKPushRegistry(),didReceiveIncomingPushWith:PKPushPayload(input),for:.voIP){completion += 1}
  expect(IncomingStateSocketProbe.created.count == before, "observer cannot connect before successful native presentation")
  probe.provider!.complete(); pump()
  expect(completion == 1 && IncomingStateSocketProbe.created.count == before+1,
    "incoming wake starts one observer without holding PushKit completion")
  let socket=IncomingStateSocketProbe.created.last!
  expect(socket.request.allHTTPHeaderFields?.count == 5, "observer uses only capability and opaque binding headers")
  socket.deliver(terminal); pump()
  expect(probe.activeCalls[uuid] == nil && probe.provider!.ended.contains(uuid), "observed \(terminal) ends exact unaccepted native call")
  expect(probe.events.filter{$0["type"] as? String == "remoteEnded"}.count == 1,
    "server state emits one remote end rather than a user decline")
  expect(!probe.callKitAudioSessionActive && probe.callKitAudioActivationOwners.isEmpty,
    "observer terminal cannot activate audio")
  socket.deliver(terminal,sequence:2);pump()
  expect(probe.events.filter{$0["type"] as? String == "remoteEnded"}.count == 1,
    "late duplicate status cannot emit another terminal")
}
for boundary in ["pending", "requested", "answered", "account", "generation", "removed", "reset"] {
  let probe=fresh(), input=observerPayload(), uuid=UUID(uuidString:input["callUuid"] as! String)!
  probe.pushRegistry(PKPushRegistry(),didReceiveIncomingPushWith:PKPushPayload(input),for:.voIP){}
  probe.provider!.complete();pump();let socket=IncomingStateSocketProbe.created.last!
  if boundary == "pending" { probe.pendingAnswerActions[uuid]=CXAnswerCallAction(call:uuid) }
  if boundary == "requested" { probe.requestedAnswerTransactions.insert(uuid) }
  if boundary == "answered" { probe.activeCalls[uuid]!.answered=true }
  if boundary == "account" { probe.installAuthority(replacementAuthority) }
  if boundary == "generation" {
    let old=probe.activeCalls[uuid]!
    probe.activeCalls[uuid]=ActiveNativeCall(uuid:uuid,inviteId:old.inviteId,threadId:old.threadId,callType:old.callType,
      ringingDeadline:old.ringingDeadline,answered:false,timeoutWorkItem:nil,presentationConfirmed:true,presentationAuthority:authority)
  }
  if boundary == "removed" { probe.remove(uuid) }
  if boundary == "reset" { probe.providerDidReset(probe.provider!) }
  if boundary == "removed" || boundary == "reset" {
    expect(socket.canceled == 1, "\(boundary) synchronously closes observer without waiting for another response")
  }
  let endedBefore=probe.provider!.ended.count
  socket.deliver("accepted");pump()
  expect(probe.provider!.ended.count == endedBefore && !hasEvent(probe,"remoteEnded"),
    "\(boundary) boundary cannot be ended by older observed server state")
  expect(socket.canceled == 1, "\(boundary) boundary retires observer transport")
  probe.remove(uuid)
}
for boundary in ["absent", "invalid-url", "failed-presentation"] {
  let probe=fresh();var input=observerPayload();let before=IncomingStateSocketProbe.created.count
  if boundary == "absent" { input.removeValue(forKey:"stateObserverCapability") }
  if boundary == "invalid-url" { input["stateObserverUrl"]="wss://other.invalid/functions/v1/ios-native-call-state" }
  var completion=0
  probe.pushRegistry(PKPushRegistry(),didReceiveIncomingPushWith:PKPushPayload(input),for:.voIP){completion += 1}
  probe.provider!.complete(error:boundary == "failed-presentation" ? ReportProbeError.rejected : nil);pump()
  expect(completion == 1 && IncomingStateSocketProbe.created.count == before,
    "\(boundary) preserves native report settlement without an observer connection")
  if let uuid=UUID(uuidString:input["callUuid"] as! String) { probe.remove(uuid) }
}

print("\(passed) native incoming-report checks PASS")
