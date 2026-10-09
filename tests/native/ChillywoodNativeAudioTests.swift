import Foundation

// The runner inserts complete production methods and the real call descriptor.
// AVAudioSession/CallKit below are controlled API receipts, not hardware audio.
// Foundation NotificationCenter delivers the actual registered observer blocks.
// INSERT_NATIVE_ERROR
// INSERT_ACTIVE_CALL

private let AVAudioSessionInterruptionTypeKey = "AVAudioSessionInterruptionTypeKey"
private enum AudioProbeError: Error { case overrideRejected, categoryRejected, activationRejected }
public final class AVAudioSession: NSObject {
  enum PortOverride: Equatable { case none, speaker }
  enum Port: Equatable { case builtInSpeaker, builtInReceiver, bluetoothHFP, headphones, unknown }
  struct PortDescription { let portType: Port }
  struct RouteDescription { let outputs: [PortDescription] }
  enum Category: Equatable { case playAndRecord }
  enum Mode: Equatable { case voiceChat }
  struct CategoryOptions: OptionSet, Equatable {
    let rawValue: Int
    static let allowBluetoothHFP = Self(rawValue: 1)
    static let allowBluetoothA2DP = Self(rawValue: 2)
  }
  struct SetActiveOptions: OptionSet, Equatable {
    let rawValue: Int
    static let notifyOthersOnDeactivation = Self(rawValue: 1)
  }
  enum InterruptionType: UInt { case began = 1, ended = 0 }
  static let interruptionNotification = Notification.Name("AVAudioSessionInterruptionNotification")
  static let routeChangeNotification = Notification.Name("AVAudioSessionRouteChangeNotification")
  static let singleton = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { singleton }
  var operations: [String] = []
  var output: PortOverride = .none
  var category: Category?
  var mode: Mode?
  var categoryOptions: CategoryOptions = []
  var active = false
  var activeOptions: SetActiveOptions = []
  var rejectOverride = false
  var rejectCategory = false
  var rejectActivation = false
  var overrideFailure: Error = AudioProbeError.overrideRejected
  var categoryFailure: Error = AudioProbeError.categoryRejected
  var observedOutputs: [Port] = [.builtInReceiver]
  var currentRouteReads = 0
  var currentRoute: RouteDescription {
    currentRouteReads += 1
    return RouteDescription(outputs: observedOutputs.map { PortDescription(portType: $0) })
  }
  func reset() {
    operations = []; output = .none; category = nil; mode = nil
    categoryOptions = []; active = false; activeOptions = []
    rejectOverride = false; rejectCategory = false; rejectActivation = false
    overrideFailure = AudioProbeError.overrideRejected; categoryFailure = AudioProbeError.categoryRejected
    observedOutputs = [.builtInReceiver]; currentRouteReads = 0
  }
  func overrideOutputAudioPort(_ port: PortOverride) throws {
    operations.append(port == .speaker ? "override:speaker" : "override:none")
    if rejectOverride { throw overrideFailure }
    output = port
  }
  func setCategory(_ category: Category, mode: Mode, options: CategoryOptions) throws {
    operations.append("category")
    if rejectCategory { throw categoryFailure }
    self.category = category; self.mode = mode; categoryOptions = options
  }
  func setActive(_ active: Bool, options: SetActiveOptions = []) throws {
    operations.append("active:\(active)")
    if rejectActivation { throw AudioProbeError.activationRejected }
    self.active = active; activeOptions = options
  }
}

enum HandleType: Hashable { case generic }
final class CXProviderConfiguration {
  var supportsVideo = false
  var maximumCallGroups = 0
  var maximumCallsPerCallGroup = 0
  var supportedHandleTypes: Set<HandleType> = []
  var includesCallsInRecents = true
  var iconTemplateImageData: Data?
  var ringtoneSound: String?
}
public final class CXProvider {
  let configuration: CXProviderConfiguration
  init(configuration: CXProviderConfiguration) { self.configuration = configuration }
  func setDelegate(_ delegate: AnyObject, queue: DispatchQueue?) {}
  func reportCall(with uuid: UUID, endedAt: Date, reason: CXCallEndedReason) {}
}
enum CXCallEndedReason { case failed }
private final class CXAnswerCallAction {
  let callUUID: UUID
  var fulfilled = 0
  var failed = 0
  var onFulfill: (() -> Void)?
  init(_ uuid: UUID) { callUUID = uuid }
  func fulfill() { fulfilled += 1; onFulfill?() }
  func fail() { failed += 1 }
}
private final class CXCallObserver {
  struct Call { let uuid: UUID; let hasEnded: Bool }
  static var observedCalls: [Call] = []
  var calls: [Call] { Self.observedCalls }
}
private let audioAuthority = NativeVoipAuthority(userId: "audio-user", accountId: "audio-account",
  sessionGeneration: "audio-session", installId: "audio-install")
private let replacementAudioAuthority = NativeVoipAuthority(userId: "other-user", accountId: "other-account",
  sessionGeneration: "other-session", installId: "other-install")
private final class UserDefaults {
  static let standard = UserDefaults()
  func removeObject(forKey key: String) {}
}
private var nativeAudioDiagnosticLines: [String] = []
private var nativeAudioDiagnosticOperations: [[String]] = []
private let nativeAudioDiagnosticFlags: [String: Any] = [
  "ChillywoodNativeCallDiagnosticsEnabled": true,
  "ChillywoodNativeCallDiagnosticsChannel": "ios-internal-v2",
  "ChillywoodNativeCallsBuildEnabled": true,
  "ChillywoodNativeCallsRuntimeDefaultEnabled": true,
]
private func clearAudioDiagnostics() {
  nativeAudioDiagnosticLines.removeAll()
  nativeAudioDiagnosticOperations.removeAll()
}
private final class CoordinatorProbe {
  var activeCalls: [UUID: ActiveNativeCall] = [:]
  var audioSessionObservers: [NSObjectProtocol] = []
  var prepared = false
  var provider: CXProvider?
  private let audioSessionDiagnostics: ChillywoodNativeCallDiagnostics
  var callKitAudioSessionActive = false
  var callKitAudioActivationOwners: [UUID: (generation: UUID, authority: NativeVoipAuthority)] = [:]
  var authority: NativeVoipAuthority? = audioAuthority
  var terminalInvites: Set<String> = []
  var pendingAnswerActions: [UUID: CXAnswerCallAction] = [:]
  var pendingAnswerTimeouts: [UUID: DispatchWorkItem] = [:]
  init(infoDictionary: [String: Any] = nativeAudioDiagnosticFlags) {
    audioSessionDiagnostics = ChillywoodNativeCallDiagnostics(infoDictionary: infoDictionary) {
      nativeAudioDiagnosticLines.append($0)
      nativeAudioDiagnosticOperations.append(AVAudioSession.sharedInstance().operations)
    }
  }
  var events: [[String: Any]] = []
  let activeCallsDefaultsKey = "controlled-audio-active-calls"
  func persistedVoipAuthority() -> NativeVoipAuthority? { authority }
  func isTerminalInvite(_ inviteId: String) -> Bool { terminalInvites.contains(inviteId) }
  func clearPendingAnswerEvent(_ uuid: UUID) {}
  func endAnswerTransitionBackgroundTask(_ uuid: UUID) {}
  func persistActiveCallDescriptors() {}
  func markTerminalInvite(_ inviteId: String) { terminalInvites.insert(inviteId) }
  func removeCall(_ uuid: UUID) -> ActiveNativeCall? {
    callKitAudioActivationOwners.removeValue(forKey: uuid)
    return activeCalls.removeValue(forKey: uuid)
  }
  func complete(_ uuid: UUID) { completeAnswerOnMain(uuid, connected: true, reason: "controlled_answer") }
  func isAudioReady(_ call: ActiveNativeCall) -> Bool { hasCurrentCallKitAudioActivation(call) }
  func recovered(_ call: ActiveNativeCall, claimedActive: Bool = true) -> [String: Any] {
    recoveredAudioReadiness(["type": "recovered", "callUuid": call.uuid.uuidString.lowercased(),
      "callInviteId": call.inviteId, "threadId": call.threadId, "audioSessionActive": claimedActive,
      "nativeCallGeneration": call.generation.uuidString.lowercased(),
      "nativeSessionGeneration": call.presentationAuthority?.sessionGeneration ?? ""])
  }
  func recoveredEvent(_ event: [String: Any]) -> [String: Any] { recoveredAudioReadiness(event) }
  func restoreActiveCallDescriptors() {}
  func emitRaw(_ event: [String: Any]) { events.append(event) }
  func prepareObservers() { prepare() }
  func receiveInterruption(_ notification: Notification) { handleAudioSessionInterruption(notification) }
  func clearEvents() { events.removeAll() }
  // INSERT_PREPARE
  // INSERT_SET_AUDIO_ROUTE
  // INSERT_PROVIDER_ACTIVATE
  // INSERT_PROVIDER_DEACTIVATE
  // INSERT_DEACTIVATE_SESSION
  // INSERT_INTERRUPTION
  // INSERT_RECORD_ACTIVATION
  // INSERT_CURRENT_ACTIVATION
  // INSERT_RECOVER_AUDIO_READINESS
  // INSERT_COMPLETE_ANSWER
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
private func expectsFailure(_ label: String, _ action: () throws -> Void) {
  do { try action(); expect(false, label) }
  catch { passed += 1 }
}
private func expectAudioDiagnostics(_ phases: [String], error: Error? = nil, errorDomain: String = "other") {
  expect(nativeAudioDiagnosticLines.count == phases.count,
    "actual audio callbacks retain exactly their expected diagnostic receipts")
  for (line, phase) in zip(nativeAudioDiagnosticLines, phases) {
    expect(line.hasPrefix("CH_NATIVE_CALL phase=\(phase) uptime_ms="),
      "actual audio callback reports the correct phase in order")
    expect(line.contains(" call_hash=none"),
      "session-wide audio receipts never bind an arbitrary active or pending call")
  }
  if let error {
    expect(nativeAudioDiagnosticLines.last!.hasSuffix(" error_domain=\(errorDomain) error_code=\((error as NSError).code)"),
      "actual failed operation retains the bounded native error domain and code")
    expect(nativeAudioDiagnosticLines.dropLast().allSatisfy { !$0.contains(" error_domain=") },
      "a native error belongs only to the failure receipt")
  } else {
    expect(nativeAudioDiagnosticLines.allSatisfy { !$0.contains(" error_domain=") },
      "nonfailure audio receipts do not fabricate native errors")
  }
}
private func sameCall(_ event: [String: Any], _ call: ActiveNativeCall, _ type: String) -> Bool {
  event["type"] as? String == type
    && event["callUuid"] as? String == call.uuid.uuidString.lowercased()
    && event["callInviteId"] as? String == call.inviteId
    && event["threadId"] as? String == call.threadId
    && event["callType"] as? String == call.callType
}
private func makeCall(_ suffix: String, uuid: UUID = UUID(), authority: NativeVoipAuthority = audioAuthority,
  answered: Bool = true, confirmed: Bool = true) -> ActiveNativeCall {
  ActiveNativeCall(uuid: uuid, inviteId: "invite-\(suffix)", threadId: "thread-\(suffix)",
    callType: "video", ringingDeadline: nil, answered: answered, timeoutWorkItem: nil,
    presentationConfirmed: confirmed, presentationAuthority: authority)
}
private let coordinator = CoordinatorProbe()
private let session = AVAudioSession.sharedInstance()
private let systemOptions: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .allowBluetoothA2DP]
private let provider = CXProvider(configuration: CXProviderConfiguration())

// Actual coordinator routing and failure propagation; receipt success does not
// prove the real currentRoute selected a speaker, receiver, or Bluetooth device.
for (route, expected) in [("speaker", AVAudioSession.PortOverride.speaker), ("receiver", .none)] {
  session.reset(); clearAudioDiagnostics()
  try coordinator.setAudioRoute(route)
  expect(session.output == expected, "\(route) requests the correct native override")
  expect(session.operations.count == 1 && session.category == nil && !session.active,
    "\(route) must not implicitly reactivate or recategorize the session")
  expectAudioDiagnostics(["audio_route_\(route)_requested", "audio_route_succeeded", "audio_route_immediate_receiver"])
  expect(nativeAudioDiagnosticOperations == [[], session.operations, session.operations],
    "request precedes native work; success and observation follow accepted native work")
}
session.reset(); clearAudioDiagnostics()
try coordinator.setAudioRoute("system")
expect(session.operations == ["override:none", "category"], "system releases override before selecting category")
expect(session.category == .playAndRecord && session.mode == .voiceChat && session.categoryOptions == systemOptions,
  "system allows both Bluetooth profiles using the voice-chat category")
expect(!session.active, "route choice does not fabricate session activation")
expectAudioDiagnostics(["audio_route_system_requested", "audio_route_succeeded", "audio_route_immediate_receiver"])
expect(nativeAudioDiagnosticOperations == [[], session.operations, session.operations],
  "system success is not recorded before the category operation returns")
session.reset(); clearAudioDiagnostics()
do {
  try coordinator.setAudioRoute("PRIVATE-UNKNOWN-ROUTE-SHOULD-NOT-APPEAR")
  expect(false, "unsupported route must throw")
} catch ChillywoodNativeCallError.unsupportedAudioRoute {
  expect(session.operations.isEmpty, "unsupported route never commands AVAudioSession")
} catch { expect(false, "unsupported route reports the documented error") }
expectAudioDiagnostics(["audio_route_failed"], error: ChillywoodNativeCallError.unsupportedAudioRoute)
expect(session.currentRouteReads == 0 && !nativeAudioDiagnosticLines.joined().contains("PRIVATE-UNKNOWN"),
  "unsupported route cannot be sampled or leak the raw requested value")
for route in ["speaker", "receiver", "system"] {
  session.reset(); clearAudioDiagnostics(); session.rejectOverride = true
  expectsFailure("\(route) native override rejection cannot become success") { try coordinator.setAudioRoute(route) }
  expect(session.operations.count == 1, "failed override prevents later native work")
  expectAudioDiagnostics(["audio_route_\(route)_requested", "audio_route_failed"], error: AudioProbeError.overrideRejected)
  expect(nativeAudioDiagnosticOperations == [[], session.operations] && session.currentRouteReads == 0,
    "override failure is recorded after the rejection without a selected-route claim")
}
session.reset(); clearAudioDiagnostics(); session.rejectCategory = true
expectsFailure("system category rejection cannot become success") { try coordinator.setAudioRoute("system") }
expect(session.operations == ["override:none", "category"] && session.category == nil,
  "system rejection retains truthful partial native receipt")
expectAudioDiagnostics(["audio_route_system_requested", "audio_route_failed"], error: AudioProbeError.categoryRejected)
expect(nativeAudioDiagnosticOperations == [[], session.operations] && session.currentRouteReads == 0,
  "category failure cannot emit an accepted or observed route")

// The observed output is independent of the requested override. Exactly one
// built-in port qualifies; absent, external, unknown or mixed outputs do not.
// This fixture controls the sample and cannot establish settled hardware audio.
for (outputs, phase) in [
  ([AVAudioSession.Port.builtInSpeaker], "speaker"),
  ([.builtInReceiver], "receiver"), ([], "no_outputs"),
  ([.bluetoothHFP], "other"), ([.headphones], "other"), ([.unknown], "other"),
  ([.builtInSpeaker, .headphones], "other"), ([.builtInReceiver, .builtInSpeaker], "other"),
  ([.builtInSpeaker, .builtInSpeaker], "other"),
] {
  for route in ["speaker", "receiver", "system"] {
    session.reset(); clearAudioDiagnostics(); session.observedOutputs = outputs
    coordinator.activeCalls = [UUID(): makeCall("unrelated-route-call")]
    try coordinator.setAudioRoute(route)
    expectAudioDiagnostics(["audio_route_\(route)_requested", "audio_route_succeeded", "audio_route_immediate_\(phase)"])
    expect(session.currentRouteReads == 1, "accepted route samples currentRoute exactly once")
    expect(nativeAudioDiagnosticOperations == [[], session.operations, session.operations],
      "all immediate observations follow accepted native operations")
  }
}
coordinator.activeCalls = [:]

// Catch/rethrow must preserve the exact native error object, including private
// contents for its original caller, while the diagnostic retains only allowed fields.
let routePrivateMarker = "PRIVATE-ROUTE-ERROR-PAYLOAD"
for (domain, allowedDomain) in [("NSOSStatusErrorDomain", "NSOSStatusErrorDomain"),
  ("com.apple.coreaudio.avfaudio", "com.apple.coreaudio.avfaudio"), (routePrivateMarker, "other")] {
  for route in ["speaker", "receiver", "system"] {
    for rejection in route == "system" ? ["override", "category"] : ["override"] {
      session.reset(); clearAudioDiagnostics()
      let originalError = NSError(domain: domain, code: -50,
        userInfo: [NSLocalizedDescriptionKey: routePrivateMarker, "private": routePrivateMarker])
      session.rejectOverride = rejection == "override"; session.rejectCategory = rejection == "category"
      session.overrideFailure = originalError; session.categoryFailure = originalError
      do { try coordinator.setAudioRoute(route); expect(false, "native error must propagate") }
      catch { expect((error as NSError) === originalError, "diagnostics rethrows the original error unchanged") }
      expectAudioDiagnostics(["audio_route_\(route)_requested", "audio_route_failed"], error: originalError, errorDomain: allowedDomain)
      expect(!nativeAudioDiagnosticLines.joined().contains(routePrivateMarker),
        "route errors never log descriptions, userInfo or arbitrary error domains")
    }
  }
}
for info in [[:], nativeAudioDiagnosticFlags.merging(["ChillywoodNativeCallDiagnosticsEnabled": false]) { _, new in new }] {
  let disabled = CoordinatorProbe(infoDictionary: info)
  for route in ["speaker", "receiver", "system"] {
    session.reset(); clearAudioDiagnostics()
    try disabled.setAudioRoute(route)
    expect(nativeAudioDiagnosticLines.isEmpty && !session.operations.isEmpty,
      "disabled internal diagnostics preserve route behavior without emitting receipts")
    session.rejectOverride = true
    expectsFailure("disabled diagnostics retain native failure") { try disabled.setAudioRoute(route) }
    expect(nativeAudioDiagnosticLines.isEmpty, "disabled diagnostics cannot emit failed-route receipts")
  }
}

// Execute real CallKit delegate methods with controlled AVAudioSession. Validate
// ordering, category, exact active-call failures, and no false activation event.
session.reset(); coordinator.clearEvents(); nativeAudioDiagnosticLines.removeAll()
coordinator.provider(provider, didActivate: session)
expect(session.operations == ["category", "active:true"] && session.active,
  "activation configures category before activating")
expect(session.categoryOptions == systemOptions && session.mode == .voiceChat,
  "activation preserves supported Bluetooth profiles")
expect(coordinator.events.isEmpty && coordinator.callKitAudioActivationOwners.isEmpty,
  "activation without a presented owner cannot emit a positive call receipt")
expectAudioDiagnostics(["audio_activation_received", "audio_activation_succeeded"])
private let first = makeCall("first")
private let second = makeCall("second")
session.reset(); coordinator.clearEvents(); nativeAudioDiagnosticLines.removeAll()
coordinator.activeCalls = [first.uuid: first, second.uuid: second]
CXCallObserver.observedCalls = [.init(uuid: first.uuid, hasEnded: false), .init(uuid: second.uuid, hasEnded: false)]
coordinator.provider(provider, didActivate: session)
expectAudioDiagnostics(["audio_activation_received", "audio_activation_succeeded"])
expect(coordinator.events.count == 2 && [first, second].allSatisfy { call in
  coordinator.events.contains { sameCall($0, call, "audioSessionActivated") }
}, "successful activation carries each exact presented call identity")
expect([first, second].allSatisfy { coordinator.isAudioReady($0) },
  "actual activation delegate records exact current native owners")
expect(coordinator.recovered(first, claimedActive: false)["audioSessionActive"] as? Bool == true,
  "same-owner recovered presentation recomputes current native activation")
for key in ["callInviteId", "threadId", "nativeCallGeneration", "nativeSessionGeneration"] {
  var stale = coordinator.recovered(first)
  stale[key] = "retired-value"
  expect(coordinator.recoveredEvent(stale)["audioSessionActive"] as? Bool == false,
    "recovered \(key) must match the exact current native owner")
  stale.removeValue(forKey: key)
  expect(coordinator.recoveredEvent(stale)["audioSessionActive"] as? Bool == false,
    "recovered readiness cannot omit \(key) ownership")
}

// Ownership cannot transfer just because the UUID, process, or AVAudioSession
// survived. These calls execute the real ownership predicate without creating
// readiness through a fixture flag or a fabricated media-track transition.
private let sameUuidReplacement = makeCall("first", uuid: first.uuid)
expect(!coordinator.isAudioReady(sameUuidReplacement),
  "same UUID with a different native generation cannot inherit activation")
coordinator.authority = replacementAudioAuthority
private var authorityReplacement = first
authorityReplacement.presentationAuthority = replacementAudioAuthority
expect(!coordinator.isAudioReady(authorityReplacement),
  "replacement persisted authority cannot inherit a previous owner's activation")
coordinator.authority = audioAuthority
private var wrongPresentationAuthority = first
wrongPresentationAuthority.presentationAuthority = replacementAudioAuthority
expect(!coordinator.isAudioReady(wrongPresentationAuthority),
  "presented descriptor must retain the activated authority")
coordinator.terminalInvites.insert(first.inviteId)
expect(!coordinator.isAudioReady(first), "terminal invite cannot retain native audio readiness")
coordinator.terminalInvites.removeAll()
CXCallObserver.observedCalls = [.init(uuid: first.uuid, hasEnded: true)]
expect(!coordinator.isAudioReady(first), "ended CallKit inventory cannot retain native audio readiness")
CXCallObserver.observedCalls = []
expect(!coordinator.isAudioReady(first), "absent CallKit inventory cannot retain native audio readiness")
CXCallObserver.observedCalls = [.init(uuid: first.uuid, hasEnded: false)]
private var unanswered = first
unanswered.answered = false
expect(!coordinator.isAudioReady(unanswered), "unanswered owner cannot authorize native capture")
private var unconfirmed = first
unconfirmed.presentationConfirmed = false
expect(!coordinator.isAudioReady(unconfirmed), "unconfirmed owner cannot authorize native capture")
coordinator.activeCalls[first.uuid] = sameUuidReplacement
expect(coordinator.recovered(sameUuidReplacement)["audioSessionActive"] as? Bool == false,
  "persisted positive field is overwritten when native generation was replaced")
coordinator.activeCalls[first.uuid] = first

// Activation received while a call is only ringing is not that call's Answer
// receipt. Execute the real Answer completion to prove a later state transition
// cannot promote a retained ringing receipt into current media authority.
do {
  let ringing = makeCall("ringing-before-activation", answered: false)
  coordinator.activeCalls = [ringing.uuid: ringing]
  CXCallObserver.observedCalls = [.init(uuid: ringing.uuid, hasEnded: false)]
  session.reset(); coordinator.clearEvents()
  coordinator.provider(provider, didActivate: session)
  expect(coordinator.callKitAudioActivationOwners.isEmpty,
    "activation cannot record a ringing call for a later Answer")
  let answer = CXAnswerCallAction(ringing.uuid)
  answer.onFulfill = {
    expect(coordinator.activeCalls[ringing.uuid]?.answered == true,
      "production Answer stores answered ownership before fulfillment can activate audio")
  }
  coordinator.pendingAnswerActions[ringing.uuid] = answer
  coordinator.complete(ringing.uuid)
  expect(answer.fulfilled == 1 && answer.failed == 0,
    "ringing transition executes successful production Answer completion")
  expect(coordinator.recovered(ringing)["audioSessionActive"] as? Bool == false,
    "later Answer cannot inherit activation received while ringing")
  coordinator.provider(provider, didActivate: session)
  expect(coordinator.recovered(ringing)["audioSessionActive"] as? Bool == true,
    "fresh activation after fulfilled Answer grants current exact-call readiness")
}
CXCallObserver.observedCalls = [.init(uuid: first.uuid, hasEnded: false)]

for invalidation in ["deactivation", "interruption"] {
  session.reset(); coordinator.clearEvents()
  coordinator.activeCalls = [first.uuid: first]
  coordinator.provider(provider, didActivate: session)
  expect(coordinator.isAudioReady(first), "invalidation setup receives actual native activation")
  if invalidation == "deactivation" {
    coordinator.provider(provider, didDeactivate: session)
  } else {
    coordinator.receiveInterruption(Notification(name: AVAudioSession.interruptionNotification, object: session,
      userInfo: [AVAudioSessionInterruptionTypeKey: UInt(1)]))
  }
  expect(!coordinator.isAudioReady(first) && coordinator.callKitAudioActivationOwners.isEmpty,
    "\(invalidation) removes current activation ownership")
  expect(coordinator.recovered(first)["audioSessionActive"] as? Bool == false,
    "\(invalidation) overwrites recovered historical positive readiness")
  coordinator.receiveInterruption(Notification(name: AVAudioSession.interruptionNotification, object: session,
    userInfo: [AVAudioSessionInterruptionTypeKey: UInt(0)]))
  expect(!coordinator.isAudioReady(first), "interruption ended cannot create a fresh activation receipt")
}

private let pendingAudio = makeCall("pending", confirmed: false)
private let wrongAuthorityAudio = makeCall("wrong-authority", authority: replacementAudioAuthority)
coordinator.activeCalls = [pendingAudio.uuid: pendingAudio, wrongAuthorityAudio.uuid: wrongAuthorityAudio]
session.reset(); coordinator.clearEvents()
coordinator.provider(provider, didActivate: session)
expect(coordinator.callKitAudioActivationOwners.isEmpty && coordinator.events.isEmpty,
  "activation never records unconfirmed or foreign-authority calls")
for failure in ["category", "active"] {
  for hasCalls in [false, true] {
    session.reset(); coordinator.activeCalls = [first.uuid: first]
    coordinator.provider(provider, didActivate: session)
    expect(coordinator.isAudioReady(first), "failure setup has prior genuine native activation")
    session.reset(); coordinator.clearEvents(); nativeAudioDiagnosticLines.removeAll()
    coordinator.activeCalls = hasCalls ? [first.uuid: first, second.uuid: second] : [:]
    session.rejectCategory = failure == "category"; session.rejectActivation = failure == "active"
    coordinator.provider(provider, didActivate: session)
    expectAudioDiagnostics(["audio_activation_received", "audio_activation_failed"],
      error: failure == "category" ? AudioProbeError.categoryRejected : AudioProbeError.activationRejected)
    expect(!session.active, "failed activation is not recorded as active")
    expect(!coordinator.callKitAudioSessionActive && coordinator.callKitAudioActivationOwners.isEmpty,
      "failed activation cannot preserve earlier positive ownership")
    expect(session.operations == (failure == "category" ? ["category"] : ["category", "active:true"]),
      "activation failure stops at the actual failing native operation")
    expect(!coordinator.events.contains { $0["type"] as? String == "audioSessionActivated" },
      "native failure never emits activation success")
    if hasCalls {
      expect(coordinator.events.count == 2 && [first, second].allSatisfy { call in
        coordinator.events.contains { sameCall($0, call, "audioSessionFailed") }
      }, "failure carries the exact currently active descriptors")
    } else {
      expect(coordinator.events.count == 1 && coordinator.events[0].count == 1
        && coordinator.events[0]["type"] as? String == "audioSessionFailed",
        "failure without an active call cannot invent call identity")
    }
  }
}
session.reset(); coordinator.clearEvents(); nativeAudioDiagnosticLines.removeAll()
try session.setActive(true); session.operations.removeAll()
coordinator.provider(provider, didDeactivate: session)
expectAudioDiagnostics(["audio_deactivation_received"])
expect(!session.active && session.operations == ["active:false"]
  && session.activeOptions == [.notifyOthersOnDeactivation], "deactivation attempts release and notifies other audio")
expect(coordinator.events.count == 1 && coordinator.events[0]["type"] as? String == "audioSessionDeactivated",
  "deactivation forwards the CallKit receipt")
// The production cleanup is best effort (try?). Its callback event is not an
// assertion that setActive(false) succeeded; assert this explicit limitation.
session.reset(); coordinator.clearEvents(); nativeAudioDiagnosticLines.removeAll()
try session.setActive(true); session.rejectActivation = true
coordinator.provider(provider, didDeactivate: session)
expectAudioDiagnostics(["audio_deactivation_received"])
expect(session.active && coordinator.events.first?["type"] as? String == "audioSessionDeactivated",
  "controlled deactivation rejection remains a known best-effort boundary, not shutdown proof")

// Real observer registration/closures, idempotence, object filtering, malformed
// interruptions and current descriptor fanout. No observer reactivates capture.
coordinator.activeCalls = [:]; coordinator.clearEvents(); session.reset()
coordinator.prepareObservers(); coordinator.prepareObservers()
expect(coordinator.audioSessionObservers.count == 2, "prepare registers audio observers once")
func interrupt(_ raw: Any?, object: AnyObject? = AVAudioSession.sharedInstance()) {
  NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: object,
    userInfo: raw.map { [AVAudioSessionInterruptionTypeKey: $0] })
}
interrupt(UInt(1))
expect(coordinator.events.count == 1 && coordinator.events[0].count == 1
  && coordinator.events[0]["type"] as? String == "audioInterruptionBegan", "empty-call interruption is raw")
coordinator.clearEvents(); coordinator.activeCalls = [first.uuid: first]
interrupt(UInt(1)); interrupt(UInt(0))
expect(coordinator.events.count == 2 && sameCall(coordinator.events[0], first, "audioInterruptionBegan")
  && sameCall(coordinator.events[1], first, "audioInterruptionEnded"), "actual observers deliver began/ended with exact active identity")
coordinator.clearEvents(); coordinator.activeCalls = [second.uuid: second]
interrupt(UInt(0))
expect(coordinator.events.count == 1 && sameCall(coordinator.events[0], second, "audioInterruptionEnded"),
  "later notification uses the current descriptor, never a retired call")
coordinator.clearEvents()
interrupt(nil); interrupt("bad"); interrupt(UInt(99)); interrupt(UInt(1), object: AVAudioSession())
expect(coordinator.events.isEmpty, "malformed or unrelated-session notifications cannot synthesize call events")
NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: session)
expect(coordinator.events.count == 1 && coordinator.events[0].count == 1
  && coordinator.events[0]["type"] as? String == "audioRouteChanged", "route observer emits a raw route event only")
expect(session.operations.isEmpty, "interruption and route observers never reopen capture or override hardware route")
for token in coordinator.audioSessionObservers { NotificationCenter.default.removeObserver(token) }
print("Swift native audio: \(passed) checks PASS; actual coordinator methods/observers, controlled AVAudioSession/CallKit receipts; hardware routing and interruption delivery NOT TESTED")
