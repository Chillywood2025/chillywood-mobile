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
  func reset() {
    operations = []; output = .none; category = nil; mode = nil
    categoryOptions = []; active = false; activeOptions = []
    rejectOverride = false; rejectCategory = false; rejectActivation = false
  }
  func overrideOutputAudioPort(_ port: PortOverride) throws {
    operations.append(port == .speaker ? "override:speaker" : "override:none")
    if rejectOverride { throw AudioProbeError.overrideRejected }
    output = port
  }
  func setCategory(_ category: Category, mode: Mode, options: CategoryOptions) throws {
    operations.append("category")
    if rejectCategory { throw AudioProbeError.categoryRejected }
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
}
private final class UserDefaults {
  static let standard = UserDefaults()
  func removeObject(forKey key: String) {}
}
private final class CoordinatorProbe {
  var activeCalls: [UUID: ActiveNativeCall] = [:]
  var audioSessionObservers: [NSObjectProtocol] = []
  var prepared = false
  var provider: CXProvider?
  var events: [[String: Any]] = []
  let activeCallsDefaultsKey = "controlled-audio-active-calls"
  func persistedVoipAuthority() -> String? { "controlled-current-authority" }
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
private func sameCall(_ event: [String: Any], _ call: ActiveNativeCall, _ type: String) -> Bool {
  event["type"] as? String == type
    && event["callUuid"] as? String == call.uuid.uuidString.lowercased()
    && event["callInviteId"] as? String == call.inviteId
    && event["threadId"] as? String == call.threadId
    && event["callType"] as? String == call.callType
}
private func makeCall(_ suffix: String) -> ActiveNativeCall {
  ActiveNativeCall(uuid: UUID(), inviteId: "invite-\(suffix)", threadId: "thread-\(suffix)",
    callType: "video", ringingDeadline: nil, answered: true, timeoutWorkItem: nil)
}
private let coordinator = CoordinatorProbe()
private let session = AVAudioSession.sharedInstance()
private let systemOptions: AVAudioSession.CategoryOptions = [.allowBluetoothHFP, .allowBluetoothA2DP]
private let provider = CXProvider(configuration: CXProviderConfiguration())

// Actual coordinator routing and failure propagation; receipt success does not
// prove the real currentRoute selected a speaker, receiver, or Bluetooth device.
for (route, expected) in [("speaker", AVAudioSession.PortOverride.speaker), ("receiver", .none)] {
  session.reset()
  try coordinator.setAudioRoute(route)
  expect(session.output == expected, "\(route) requests the correct native override")
  expect(session.operations.count == 1 && session.category == nil && !session.active,
    "\(route) must not implicitly reactivate or recategorize the session")
}
session.reset()
try coordinator.setAudioRoute("system")
expect(session.operations == ["override:none", "category"], "system releases override before selecting category")
expect(session.category == .playAndRecord && session.mode == .voiceChat && session.categoryOptions == systemOptions,
  "system allows both Bluetooth profiles using the voice-chat category")
expect(!session.active, "route choice does not fabricate session activation")
session.reset()
do {
  try coordinator.setAudioRoute("unsupported")
  expect(false, "unsupported route must throw")
} catch ChillywoodNativeCallError.unsupportedAudioRoute {
  expect(session.operations.isEmpty, "unsupported route never commands AVAudioSession")
} catch { expect(false, "unsupported route reports the documented error") }
for route in ["speaker", "receiver", "system"] {
  session.reset(); session.rejectOverride = true
  expectsFailure("\(route) native override rejection cannot become success") { try coordinator.setAudioRoute(route) }
  expect(session.operations.count == 1, "failed override prevents later native work")
}
session.reset(); session.rejectCategory = true
expectsFailure("system category rejection cannot become success") { try coordinator.setAudioRoute("system") }
expect(session.operations == ["override:none", "category"] && session.category == nil,
  "system rejection retains truthful partial native receipt")

// Execute real CallKit delegate methods with controlled AVAudioSession. Validate
// ordering, category, exact active-call failures, and no false activation event.
session.reset(); coordinator.clearEvents()
coordinator.provider(provider, didActivate: session)
expect(session.operations == ["category", "active:true"] && session.active,
  "activation configures category before activating")
expect(session.categoryOptions == systemOptions && session.mode == .voiceChat,
  "activation preserves supported Bluetooth profiles")
expect(coordinator.events.count == 1 && coordinator.events[0]["type"] as? String == "audioSessionActivated",
  "activation success emits exactly one event")
private let first = makeCall("first")
private let second = makeCall("second")
for failure in ["category", "active"] {
  for hasCalls in [false, true] {
    session.reset(); coordinator.clearEvents()
    coordinator.activeCalls = hasCalls ? [first.uuid: first, second.uuid: second] : [:]
    session.rejectCategory = failure == "category"; session.rejectActivation = failure == "active"
    coordinator.provider(provider, didActivate: session)
    expect(!session.active, "failed activation is not recorded as active")
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
session.reset(); coordinator.clearEvents()
try session.setActive(true); session.operations.removeAll()
coordinator.provider(provider, didDeactivate: session)
expect(!session.active && session.operations == ["active:false"]
  && session.activeOptions == [.notifyOthersOnDeactivation], "deactivation attempts release and notifies other audio")
expect(coordinator.events.count == 1 && coordinator.events[0]["type"] as? String == "audioSessionDeactivated",
  "deactivation forwards the CallKit receipt")
// The production cleanup is best effort (try?). Its callback event is not an
// assertion that setActive(false) succeeded; assert this explicit limitation.
session.reset(); coordinator.clearEvents(); try session.setActive(true); session.rejectActivation = true
coordinator.provider(provider, didDeactivate: session)
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
