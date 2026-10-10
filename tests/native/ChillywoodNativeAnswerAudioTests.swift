import Foundation

// Complete production declarations are inserted by the runner. CallKit,
// AVAudioSession, persistence and diagnostic output are controlled receipts;
// this probe does not claim OS activation, microphone capture or audible media.
// INSERT_NATIVE_ERROR
// INSERT_ACTIVE_CALL
// INSERT_AUTHORITY
// INSERT_DIAGNOSTIC_PHASE

private var operations: [String] = []
private final class AVAudioSession {
  enum Category: Equatable { case playAndRecord }
  enum Mode: Equatable { case voiceChat }
  struct CategoryOptions: OptionSet, Equatable {
    let rawValue: Int
    static let allowBluetoothHFP = Self(rawValue: 1)
    static let allowBluetoothA2DP = Self(rawValue: 2)
  }
  static let singleton = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { singleton }
  var category: Category?
  var mode: Mode?
  var options: CategoryOptions = []
  var categoryCalls = 0
  var activationCalls = 0
  var failure: NSError?
  func reset() {
    category = nil; mode = nil; options = []; categoryCalls = 0
    activationCalls = 0; failure = nil
  }
  func setCategory(_ category: Category, mode: Mode, options: CategoryOptions) throws {
    operations.append("category")
    categoryCalls += 1
    if let failure { throw failure }
    self.category = category; self.mode = mode; self.options = options
  }
  func setActive(_ active: Bool) throws {
    activationCalls += 1
    operations.append("active:\(active)")
  }
}

private final class CXAnswerCallAction {
  let callUUID: UUID
  var fulfilled = 0
  var failed = 0
  var operationsAtFulfill: [String] = []
  init(_ uuid: UUID) { callUUID = uuid }
  func fulfill() {
    operationsAtFulfill = operations
    operations.append("fulfill")
    fulfilled += 1
  }
  func fail() { operations.append("fail"); failed += 1 }
}
private enum CXCallEndedReason: Equatable { case failed }
private final class CXProvider {
  var ended: [(UUID, CXCallEndedReason)] = []
  func reportCall(with uuid: UUID, endedAt: Date, reason: CXCallEndedReason) {
    operations.append("native-end")
    ended.append((uuid, reason))
  }
}
private final class UserDefaults {
  static let standard = UserDefaults()
  var storage: [String: Any] = [:]
  func set(_ value: Any?, forKey key: String) { storage[key] = value }
}
private struct DiagnosticReceipt {
  let phase: ChillywoodNativeCallDiagnosticPhase
  let callUuid: UUID?
  let error: Error?
}
private final class ChillywoodNativeCallDiagnostics {
  static let shared = ChillywoodNativeCallDiagnostics()
  var receipts: [DiagnosticReceipt] = []
  func record(_ phase: ChillywoodNativeCallDiagnosticPhase, callUuid: UUID? = nil,
              error: Error? = nil, uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) {
    operations.append("diagnostic:\(phase.rawValue)")
    receipts.append(DiagnosticReceipt(phase: phase, callUuid: callUuid, error: error))
  }
}

private final class CoordinatorProbe {
  var activeCalls: [UUID: ActiveNativeCall] = [:]
  var callKitAudioActivationOwners: [UUID: (generation: UUID, authority: NativeVoipAuthority)] = [:]
  var pendingAnswerActions: [UUID: CXAnswerCallAction] = [:]
  var pendingAnswerTimeouts: [UUID: DispatchWorkItem] = [:]
  var requestedAnswerTransactions: Set<UUID> = []
  var pendingAnswerEvents: Set<UUID> = []
  var backgroundTasks: Set<UUID> = []
  var terminalInvites: Set<String> = []
  var events: [[String: Any]] = []
  var provider: CXProvider? = CXProvider()
  let audioSessionDiagnostics = ChillywoodNativeCallDiagnostics.shared
  let activeCallsDefaultsKey = "controlled-answer-audio-descriptors"
  func clearPendingAnswerEvent(_ uuid: UUID) { pendingAnswerEvents.remove(uuid) }
  func endAnswerTransitionBackgroundTask(_ uuid: UUID) { backgroundTasks.remove(uuid) }
  func markTerminalInvite(_ inviteId: String) { terminalInvites.insert(inviteId) }
  func settleIncomingReport(_ uuid: UUID, generation: UUID?, error: Error?) {}
  func settleRequestedAnswers(_ uuid: UUID, result: Result<Void, Error>) {}
  func emitRaw(_ event: [String: Any]) { events.append(event) }
  func complete(_ uuid: UUID, connected: Bool, reason: String = "controlled_media_ready") {
    completeAnswerOnMain(uuid, connected: connected, reason: reason)
  }
  func save() { persistActiveCallDescriptors() }
  // INSERT_COMPLETE_ANSWER
  // INSERT_REMOVE_CALL
  // INSERT_PERSIST_CALLS
  // INSERT_EMIT
}

private var passed = 0
private func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(label)\n".utf8))
    exit(1)
  }
  passed += 1
}
private let session = AVAudioSession.sharedInstance()
private let diagnostics = ChillywoodNativeCallDiagnostics.shared
private let bluetoothOptions: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .allowBluetoothA2DP]
private func fresh(_ type: String = "voice") -> (CoordinatorProbe, ActiveNativeCall, CXAnswerCallAction, DispatchWorkItem) {
  session.reset(); diagnostics.receipts.removeAll(); operations.removeAll()
  UserDefaults.standard.storage.removeAll()
  let coordinator = CoordinatorProbe()
  let call = ActiveNativeCall(uuid: UUID(), inviteId: "controlled-invite", threadId: "controlled-thread",
    callType: type, ringingDeadline: nil, answered: false, timeoutWorkItem: nil,
    presentationConfirmed: true)
  let action = CXAnswerCallAction(call.uuid)
  let timeout = DispatchWorkItem {}
  coordinator.activeCalls[call.uuid] = call
  coordinator.pendingAnswerActions[call.uuid] = action
  coordinator.pendingAnswerTimeouts[call.uuid] = timeout
  coordinator.pendingAnswerEvents.insert(call.uuid)
  coordinator.backgroundTasks.insert(call.uuid)
  coordinator.requestedAnswerTransactions.insert(call.uuid)
  coordinator.save()
  return (coordinator, call, action, timeout)
}
private func expectPhases(_ phases: [String], for uuid: UUID) {
  expect(diagnostics.receipts.map { $0.phase.rawValue } == phases,
    "Answer diagnostics describe the exact requested/success/failure path")
  expect(diagnostics.receipts.allSatisfy { $0.callUuid == uuid },
    "Answer diagnostics retain the exact pending call identity")
}
private func expectEvent(_ coordinator: CoordinatorProbe, _ type: String, _ call: ActiveNativeCall, reason: String) {
  expect(coordinator.events.count == 1, "Answer completion emits exactly one terminal or answered event")
  let event = coordinator.events[0]
  expect(event["type"] as? String == type && event["callUuid"] as? String == call.uuid.uuidString.lowercased()
    && event["callInviteId"] as? String == call.inviteId && event["threadId"] as? String == call.threadId
    && event["callType"] as? String == call.callType && event["reason"] as? String == reason,
    "Answer completion event preserves exact identity, media kind and reason")
}
private func expectRetiredPending(_ coordinator: CoordinatorProbe, _ call: ActiveNativeCall, _ timeout: DispatchWorkItem) {
  expect(coordinator.pendingAnswerActions[call.uuid] == nil && coordinator.pendingAnswerTimeouts[call.uuid] == nil
    && timeout.isCancelled && !coordinator.pendingAnswerEvents.contains(call.uuid)
    && !coordinator.backgroundTasks.contains(call.uuid),
    "completion retires the exact pending Answer, timeout, durable event and background lease")
}

for type in ["voice", "video"] {
  let (coordinator, call, action, timeout) = fresh(type)
  coordinator.complete(call.uuid, connected: true)
  expect(action.operationsAtFulfill.contains("category"), "Answer configures audio before fulfillment")
  expect(session.categoryCalls == 1 && session.category == .playAndRecord && session.mode == .voiceChat
    && session.options == bluetoothOptions, "voice and video Answer use exactly the intended audio category, mode and Bluetooth options")
  expect(session.activationCalls == 0, "Answer preparation must not activate the audio session")
  expect(action.fulfilled == 1 && action.failed == 0 && coordinator.activeCalls[call.uuid]?.answered == true,
    "successful configuration fulfills the exact pending Answer once")
  expect(action.operationsAtFulfill == ["diagnostic:answer_audio_configuration_requested", "category",
    "diagnostic:answer_audio_configuration_succeeded"], "configuration diagnostics bracket native work before fulfillment")
  expectPhases(["answer_audio_configuration_requested", "answer_audio_configuration_succeeded", "answer_fulfilled"], for: call.uuid)
  expect(diagnostics.receipts.allSatisfy { $0.error == nil }, "successful configuration cannot fabricate an error receipt")
  let stored = UserDefaults.standard.storage[coordinator.activeCallsDefaultsKey] as? [[String: Any]]
  expect(stored?.count == 1 && stored?.first?["answered"] as? Bool == true,
    "successful Answer persists answered ownership")
  expect(coordinator.provider?.ended.isEmpty == true && coordinator.terminalInvites.isEmpty,
    "successful Answer retains the call without terminal cleanup")
  expectRetiredPending(coordinator, call, timeout)
  expectEvent(coordinator, "answered", call, reason: "controlled_media_ready")
  let priorOperations = operations
  coordinator.complete(call.uuid, connected: true)
  expect(operations == priorOperations && action.fulfilled == 1 && coordinator.events.count == 1,
    "duplicate completion cannot configure or fulfill the Answer twice")
}

for type in ["voice", "video"] {
  let (coordinator, call, action, timeout) = fresh(type)
  let rejection = NSError(domain: "NSOSStatusErrorDomain", code: -50)
  session.failure = rejection
  coordinator.complete(call.uuid, connected: true)
  expect(action.fulfilled == 0 && action.failed == 1 && coordinator.activeCalls[call.uuid] == nil,
    "category failure fails the Answer and removes call ownership")
  expect(session.categoryCalls == 1 && session.activationCalls == 0 && session.category == nil,
    "failed category configuration neither retries nor activates")
  expect(coordinator.terminalInvites == [call.inviteId] && coordinator.provider?.ended.count == 1
    && coordinator.provider?.ended.first?.0 == call.uuid && coordinator.provider?.ended.first?.1 == .failed,
    "configuration failure uses exact-call terminal cleanup")
  expect((UserDefaults.standard.storage[coordinator.activeCallsDefaultsKey] as? [[String: Any]])?.isEmpty == true,
    "configuration failure removes persisted native ownership")
  expectPhases(["answer_audio_configuration_requested", "answer_audio_configuration_failed", "answer_failed"], for: call.uuid)
  expect(operations == ["diagnostic:answer_audio_configuration_requested", "category",
    "diagnostic:answer_audio_configuration_failed", "fail", "diagnostic:answer_failed", "native-end"],
    "failed configuration is diagnosed before failing and ending the exact call")
  expect(diagnostics.receipts[1].error.map { ($0 as NSError) === rejection } == true
    && diagnostics.receipts[0].error == nil && diagnostics.receipts[2].error == nil,
    "configuration failure diagnostic receives the original error only at the failure phase")
  expectRetiredPending(coordinator, call, timeout)
  expectEvent(coordinator, "answerFailed", call, reason: "audio_session_configuration_failed")
  let priorOperations = operations
  coordinator.complete(call.uuid, connected: true)
  expect(operations == priorOperations && action.failed == 1 && coordinator.provider?.ended.count == 1,
    "duplicate failed completion cannot repeat audio work or terminal cleanup")
}

do {
  let (coordinator, call, action, timeout) = fresh()
  coordinator.complete(call.uuid, connected: false, reason: "media_connection_timeout")
  expect(session.categoryCalls == 0 && session.activationCalls == 0,
    "disconnected completion skips audio configuration")
  expect(action.failed == 1 && action.fulfilled == 0 && coordinator.activeCalls[call.uuid] == nil
    && coordinator.terminalInvites == [call.inviteId] && coordinator.provider?.ended.count == 1,
    "disconnected completion retains existing failed Answer cleanup")
  expectRetiredPending(coordinator, call, timeout)
  expectPhases(["answer_failed"], for: call.uuid)
  expectEvent(coordinator, "answerFailed", call, reason: "media_connection_timeout")
}
do {
  let (coordinator, call, action, _) = fresh()
  coordinator.pendingAnswerActions.removeValue(forKey: call.uuid)
  coordinator.complete(call.uuid, connected: true)
  expect(session.categoryCalls == 0 && session.activationCalls == 0 && diagnostics.receipts.isEmpty,
    "completion without a pending Answer skips audio configuration")
  expect(action.fulfilled == 0 && action.failed == 0 && coordinator.events.isEmpty
    && coordinator.activeCalls[call.uuid]?.answered == false,
    "completion without a pending Answer cannot change live call ownership")
}
do {
  let (coordinator, call, action, timeout) = fresh()
  coordinator.activeCalls.removeValue(forKey: call.uuid)
  coordinator.complete(call.uuid, connected: true)
  expect(session.categoryCalls == 0 && session.activationCalls == 0 && diagnostics.receipts.isEmpty,
    "completion without the exact active call skips audio configuration")
  expect(action.failed == 1 && action.fulfilled == 0 && coordinator.events.isEmpty,
    "missing call fails only the pending Answer without synthesizing a call event")
  expectRetiredPending(coordinator, call, timeout)
}

print("Swift Answer audio: \(passed) checks PASS; actual completion/removal/persistence/event methods with controlled audio and CallKit receipts; OS activation and physical microphone/audio NOT TESTED")
