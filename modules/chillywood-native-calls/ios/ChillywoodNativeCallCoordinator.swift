import AVFAudio
import CallKit
import Foundation
import PushKit

enum ChillywoodNativeCallError: Error {
  case buildDisabled
  case debugTriggerUnavailable
  case invalidCallUuid
  case invalidPayload
  case providerUnavailable
  case unsupportedAudioRoute
}

private struct ActiveNativeCall {
  let uuid: UUID
  let inviteId: String
  let threadId: String
  let callType: String
  var answered: Bool
  var timeoutWorkItem: DispatchWorkItem?
}

public final class ChillywoodNativeCallCoordinator: NSObject, CXProviderDelegate, PKPushRegistryDelegate, @unchecked Sendable {
  public static let shared = ChillywoodNativeCallCoordinator()

  private let callController = CXCallController()
  private let stateQueue = DispatchQueue(label: "com.chillywood.native-calls.state")
  private var provider: CXProvider?
  private var pushRegistry: PKPushRegistry?
  private var activeCalls: [UUID: ActiveNativeCall] = [:]
  private var pendingEvents: [[String: Any]] = []
  private var audioSessionObservers: [NSObjectProtocol] = []
  private var prepared = false

  public var eventSink: (([String: Any]) -> Void)? {
    didSet {
      guard eventSink != nil else { return }
      drainPendingEvents().forEach { eventSink?($0) }
    }
  }

  public var isBuildEnabled: Bool {
    Bundle.main.object(forInfoDictionaryKey: "ChillywoodNativeCallsBuildEnabled") as? Bool == true
  }

  private override init() {
    super.init()
  }

  public func prepareIfEnabled() {
    guard isBuildEnabled else { return }
    prepare()
  }

  private func prepare() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !prepared else { return }
    prepared = true

    let configuration = CXProviderConfiguration()
    configuration.supportsVideo = true
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.generic]
    configuration.includesCallsInRecents = false
    configuration.iconTemplateImageData = nil
    // Use CallKit's bundled system ringtone until an iOS-specific resource is
    // copied into the application target by a reviewed native build step.
    configuration.ringtoneSound = nil

    let nextProvider = CXProvider(configuration: configuration)
    nextProvider.setDelegate(self, queue: .main)
    provider = nextProvider

    let notificationCenter = NotificationCenter.default
    audioSessionObservers = [
      notificationCenter.addObserver(
        forName: AVAudioSession.interruptionNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] notification in
        self?.handleAudioSessionInterruption(notification)
      },
      notificationCenter.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: AVAudioSession.sharedInstance(),
        queue: .main
      ) { [weak self] _ in
        self?.emitRaw(["type": "audioRouteChanged"])
      },
    ]
  }

  public func startVoipRegistration() throws {
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.prepare()
      guard self.pushRegistry == nil else { return }
      let registry = PKPushRegistry(queue: .main)
      registry.delegate = self
      registry.desiredPushTypes = [.voIP]
      self.pushRegistry = registry
    }
  }

  public func stopVoipRegistration() {
    DispatchQueue.main.async { [weak self] in
      self?.pushRegistry?.desiredPushTypes = []
      self?.pushRegistry?.delegate = nil
      self?.pushRegistry = nil
    }
  }

  public func reportIncomingCall(payload: [String: Any]) async throws -> String {
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    return try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          continuation.resume(throwing: ChillywoodNativeCallError.invalidPayload)
          return
        }
        self.prepare()
        do {
          let callUuid = try self.reportIncomingCallOnMain(payload: payload)
          continuation.resume(returning: callUuid.uuidString.lowercased())
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  #if DEBUG
  public func reportDebugIncomingCall(payload: [String: Any]) async throws -> String {
    var debugPayload = payload
    debugPayload["callInviteId"] = (payload["callInviteId"] as? String) ?? "local-debug-invite"
    debugPayload["threadId"] = (payload["threadId"] as? String) ?? "local-debug-thread"
    debugPayload["callerName"] = (payload["callerName"] as? String) ?? "Chi'llywood Test Caller"
    debugPayload["callType"] = (payload["callType"] as? String) ?? "voice"
    debugPayload["debug"] = true
    return try await reportIncomingCall(payload: debugPayload)
  }
  #endif

  private func reportIncomingCallOnMain(
    payload: [String: Any],
    completion: ((Error?) -> Void)? = nil
  ) throws -> UUID {
    dispatchPrecondition(condition: .onQueue(.main))
    guard
      let inviteId = payload["callInviteId"] as? String,
      !inviteId.isEmpty,
      let threadId = payload["threadId"] as? String,
      !threadId.isEmpty
    else {
      throw ChillywoodNativeCallError.invalidPayload
    }

    let suppliedUuid = (payload["callUuid"] as? String).flatMap(UUID.init(uuidString:))
    let callUuid = suppliedUuid ?? UUID()
    if activeCalls[callUuid] != nil {
      completion?(nil)
      return callUuid
    }
    if let existing = activeCalls.values.first(where: { $0.inviteId == inviteId }) {
      completion?(nil)
      return existing.uuid
    }
    guard let provider else { throw ChillywoodNativeCallError.providerUnavailable }

    let callType = payload["callType"] as? String == "video" ? "video" : "voice"
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: (payload["callerName"] as? String) ?? "Chi'llywood caller")
    update.localizedCallerName = (payload["callerName"] as? String) ?? "Chi'llywood caller"
    update.hasVideo = callType == "video"
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false

    var call = ActiveNativeCall(
      uuid: callUuid,
      inviteId: inviteId,
      threadId: threadId,
      callType: callType,
      answered: false,
      timeoutWorkItem: nil
    )
    let timeoutWorkItem = DispatchWorkItem { [weak self] in
      self?.timeoutCall(callUuid)
    }
    call.timeoutWorkItem = timeoutWorkItem
    activeCalls[callUuid] = call

    provider.reportNewIncomingCall(with: callUuid, update: update) { [weak self] error in
      if let error {
        self?.removeCall(callUuid)
        self?.emit(type: "reportFailed", call: call, reason: String(describing: type(of: error)))
        completion?(error)
        return
      }
      self?.emit(type: "incoming", call: call)
      DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: timeoutWorkItem)
      completion?(nil)
    }
    return callUuid
  }

  public func endCall(callUuid: String, reason: String) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    let action = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { [weak self] error in
      if error != nil {
        DispatchQueue.main.async {
          if let call = self?.removeCall(uuid) {
            self?.provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            self?.emit(type: "ended", call: call, reason: reason)
          }
        }
      }
    }
  }

  public func setMuted(callUuid: String, muted: Bool) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    let transaction = CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))
    callController.request(transaction) { _ in }
  }

  public func setAudioRoute(_ route: String) throws {
    let session = AVAudioSession.sharedInstance()
    switch route {
    case "speaker":
      try session.overrideOutputAudioPort(.speaker)
    case "receiver":
      try session.overrideOutputAudioPort(.none)
    case "system":
      try session.overrideOutputAudioPort(.none)
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
    default:
      throw ChillywoodNativeCallError.unsupportedAudioRoute
    }
  }

  public func applicationDidBecomeActive() {
    guard isBuildEnabled else { return }
    emitRaw(["type": "applicationActive"])
  }

  public func applicationWillTerminate() {
    activeCalls.values.forEach { $0.timeoutWorkItem?.cancel() }
    deactivateAudioSession()
  }

  public func drainPendingEvents() -> [[String: Any]] {
    stateQueue.sync {
      let events = pendingEvents
      pendingEvents.removeAll()
      return events
    }
  }

  private func timeoutCall(_ uuid: UUID) {
    guard let call = activeCalls[uuid], !call.answered else { return }
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    _ = removeCall(uuid)
    emit(type: "timeout", call: call, reason: "unanswered")
  }

  @discardableResult
  private func removeCall(_ uuid: UUID) -> ActiveNativeCall? {
    guard let call = activeCalls.removeValue(forKey: uuid) else { return nil }
    call.timeoutWorkItem?.cancel()
    return call
  }

  private func emit(type: String, call: ActiveNativeCall, reason: String? = nil) {
    var event: [String: Any] = [
      "type": type,
      "callUuid": call.uuid.uuidString.lowercased(),
      "callInviteId": call.inviteId,
      "threadId": call.threadId,
      "callType": call.callType,
    ]
    if let reason { event["reason"] = reason }
    emitRaw(event)
  }

  private func emitRaw(_ event: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if let eventSink = self.eventSink {
        eventSink(event)
      } else {
        self.stateQueue.sync {
          self.pendingEvents.append(event)
          if self.pendingEvents.count > 32 { self.pendingEvents.removeFirst() }
        }
      }
    }
  }

  // MARK: - PushKit

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    emitRaw(["type": "voipTokenUpdated", "token": token])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    emitRaw(["type": "voipTokenInvalidated"])
  }

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    do {
      let normalizedPayload = payload.dictionaryPayload.reduce(into: [String: Any]()) { result, entry in
        guard let key = entry.key as? String else { return }
        result[key] = entry.value
      }
      _ = try reportIncomingCallOnMain(payload: normalizedPayload) { _ in
        completion()
      }
    } catch {
      emitRaw(["type": "invalidIncomingPayload"])
      completion()
    }
  }

  // MARK: - CallKit

  public func providerDidReset(_ provider: CXProvider) {
    let calls = activeCalls.values
    activeCalls.removeAll()
    calls.forEach {
      $0.timeoutWorkItem?.cancel()
      emit(type: "providerReset", call: $0)
    }
    deactivateAudioSession()
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard var call = activeCalls[action.callUUID] else {
      action.fail()
      return
    }
    call.answered = true
    call.timeoutWorkItem?.cancel()
    activeCalls[action.callUUID] = call
    emit(type: "answered", call: call)
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let call = removeCall(action.callUUID) else {
      action.fulfill()
      return
    }
    emit(type: call.answered ? "ended" : "declined", call: call)
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    if let call = activeCalls[action.callUUID] {
      emit(type: action.isMuted ? "muted" : "unmuted", call: call)
    }
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    do {
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
      try audioSession.setActive(true)
      emitRaw(["type": "audioSessionActivated"])
    } catch {
      emitRaw(["type": "audioSessionFailed"])
    }
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    deactivateAudioSession()
    emitRaw(["type": "audioSessionDeactivated"])
  }

  private func deactivateAudioSession() {
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard
      let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let interruptionType = AVAudioSession.InterruptionType(rawValue: rawType)
    else {
      return
    }

    emitRaw([
      "type": interruptionType == .began
        ? "audioInterruptionBegan"
        : "audioInterruptionEnded",
    ])
  }
}
