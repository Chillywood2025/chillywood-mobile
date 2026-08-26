import AVFAudio
import CallKit
import Foundation
import PushKit

enum ChillywoodNativeCallError: Error {
  case buildDisabled
  case debugTriggerUnavailable
  case invalidCallUuid
  case invalidPayload
  case answerNotPending
  case providerUnavailable
  case runtimeDisabled
  case unsupportedAudioRoute
}

private struct ActiveNativeCall {
  let uuid: UUID
  let inviteId: String
  let threadId: String
  let callType: String
  let expiresAt: Date?
  var answered: Bool
  var timeoutWorkItem: DispatchWorkItem?
}

private struct NativeVoipAuthority: Codable, Equatable, Sendable {
  let userId: String
  let accountId: String
  let sessionGeneration: String
  let installId: String
}

public final class ChillywoodNativeCallCoordinator: NSObject, CXProviderDelegate, PKPushRegistryDelegate, @unchecked Sendable {
  public static let shared = ChillywoodNativeCallCoordinator()

  private let callController = CXCallController()
  private let stateQueue = DispatchQueue(label: "com.chillywood.native-calls.state")
  private let pendingEventsDefaultsKey = "com.chillywood.native-calls.pending-events.v1"
  private let terminalInvitesDefaultsKey = "com.chillywood.native-calls.terminal-invites.v1"
  private let activeCallsDefaultsKey = "com.chillywood.native-calls.active-descriptors.v1"
  private let voipAuthorityDefaultsKey = "com.chillywood.native-calls.session-authority.v1"
  private var provider: CXProvider?
  private var pushRegistry: PKPushRegistry?
  private var activeCalls: [UUID: ActiveNativeCall] = [:]
  private var pendingAnswerActions: [UUID: CXAnswerCallAction] = [:]
  private var pendingAnswerTimeouts: [UUID: DispatchWorkItem] = [:]
  private var requestedEndReasons: [UUID: String] = [:]
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

  public var isRuntimeDefaultEnabled: Bool {
    Bundle.main.object(forInfoDictionaryKey: "ChillywoodNativeCallsRuntimeDefaultEnabled") as? Bool == true
  }

  private override init() {
    super.init()
  }

  public func prepareIfEnabled() {
    guard isBuildEnabled else { return }
    prepare()
    guard isRuntimeDefaultEnabled, persistedVoipAuthority() != nil else { return }
    startVoipRegistrationOnMain()
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
    if persistedVoipAuthority() == nil {
      UserDefaults.standard.removeObject(forKey: activeCallsDefaultsKey)
    } else {
      restoreActiveCallDescriptors()
    }

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

  public func startVoipRegistration(
    userId: String,
    accountId: String,
    sessionGeneration: String,
    installId: String
  ) throws {
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    guard isRuntimeDefaultEnabled else { throw ChillywoodNativeCallError.runtimeDisabled }
    let authority = NativeVoipAuthority(
      userId: userId.trimmingCharacters(in: .whitespacesAndNewlines),
      accountId: accountId.trimmingCharacters(in: .whitespacesAndNewlines),
      sessionGeneration: sessionGeneration.trimmingCharacters(in: .whitespacesAndNewlines),
      installId: installId.trimmingCharacters(in: .whitespacesAndNewlines)
    )
    guard isValidVoipAuthority(authority) else { throw ChillywoodNativeCallError.invalidPayload }
    let configure = { [weak self] in
      guard let self else { return }
      let previousAuthority = self.persistedVoipAuthority()
      if previousAuthority != nil && previousAuthority != authority {
        self.resetAccountContextOnMain()
        self.pushRegistry?.desiredPushTypes = []
        self.pushRegistry?.delegate = nil
        self.pushRegistry = nil
      }
      self.persistVoipAuthority(authority)
      self.prepare()
      self.startVoipRegistrationOnMain()
    }
    if Thread.isMainThread { configure() }
    else { DispatchQueue.main.sync(execute: configure) }
  }

  private func startVoipRegistrationOnMain() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard isBuildEnabled, isRuntimeDefaultEnabled, pushRegistry == nil else { return }
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
  }

  public func stopVoipRegistration() {
    let stop = { [weak self] in
      guard let self else { return }
      UserDefaults.standard.removeObject(forKey: self.voipAuthorityDefaultsKey)
      self.resetAccountContextOnMain()
      self.pushRegistry?.desiredPushTypes = []
      self.pushRegistry?.delegate = nil
      self.pushRegistry = nil
    }
    if Thread.isMainThread { stop() }
    else { DispatchQueue.main.sync(execute: stop) }
  }

  private func isValidVoipAuthority(_ authority: NativeVoipAuthority) -> Bool {
    authority.accountId == authority.userId
      && UUID(uuidString: authority.userId) != nil
      && UUID(uuidString: authority.sessionGeneration) != nil
      && authority.installId.count >= 8
      && authority.installId.count <= 200
  }

  private func persistedVoipAuthority() -> NativeVoipAuthority? {
    guard
      let data = UserDefaults.standard.data(forKey: voipAuthorityDefaultsKey),
      let authority = try? JSONDecoder().decode(NativeVoipAuthority.self, from: data),
      isValidVoipAuthority(authority)
    else { return nil }
    return authority
  }

  private func persistVoipAuthority(_ authority: NativeVoipAuthority) {
    guard let encoded = try? JSONEncoder().encode(authority) else {
      UserDefaults.standard.removeObject(forKey: voipAuthorityDefaultsKey)
      return
    }
    UserDefaults.standard.set(encoded, forKey: voipAuthorityDefaultsKey)
  }

  private func resetAccountContextOnMain() {
    dispatchPrecondition(condition: .onQueue(.main))
    let calls = Array(activeCalls.values)
    calls.forEach { call in
      call.timeoutWorkItem?.cancel()
      failPendingAnswer(call.uuid)
      provider?.reportCall(with: call.uuid, endedAt: Date(), reason: .remoteEnded)
    }
    activeCalls.removeAll()
    pendingAnswerActions.values.forEach { $0.fail() }
    pendingAnswerActions.removeAll()
    pendingAnswerTimeouts.values.forEach { $0.cancel() }
    pendingAnswerTimeouts.removeAll()
    requestedEndReasons.removeAll()
    UserDefaults.standard.removeObject(forKey: activeCallsDefaultsKey)
    UserDefaults.standard.removeObject(forKey: terminalInvitesDefaultsKey)
    stateQueue.sync {
      pendingEvents.removeAll()
      UserDefaults.standard.removeObject(forKey: pendingEventsDefaultsKey)
    }
    deactivateAudioSession()
  }

  private func voipPayloadMatchesPersistedAuthority(_ payload: [String: Any]) -> Bool {
    guard let authority = persistedVoipAuthority() else { return false }
    return toText(payload["recipientUserId"]) == authority.userId
      && toText(payload["recipientAccountId"]) == authority.accountId
      && toText(payload["recipientSessionGeneration"]) == authority.sessionGeneration
      && toText(payload["recipientInstallId"]) == authority.installId
  }

  public func reportIncomingCall(payload: [String: Any]) async throws -> String {
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    guard isRuntimeDefaultEnabled else { throw ChillywoodNativeCallError.runtimeDisabled }
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
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    return try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          continuation.resume(throwing: ChillywoodNativeCallError.invalidPayload)
          return
        }
        self.prepare()
        do {
          let callUuid = try self.reportIncomingCallOnMain(payload: debugPayload)
          continuation.resume(returning: callUuid.uuidString.lowercased())
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }
  #endif

  private func parseServerDate(_ value: Any?) -> Date? {
    guard let text = value as? String, !text.isEmpty else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: text) { return date }
    return ISO8601DateFormatter().date(from: text)
  }

  private func toText(_ value: Any?) -> String {
    guard let text = value as? String else { return "" }
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

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
    guard !isTerminalInvite(inviteId) else {
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
    let expiresAt = parseServerDate(payload["expiresAt"])
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
      expiresAt: expiresAt,
      answered: false,
      timeoutWorkItem: nil
    )
    let timeoutWorkItem = DispatchWorkItem { [weak self] in
      self?.timeoutCall(callUuid)
    }
    call.timeoutWorkItem = timeoutWorkItem
    activeCalls[callUuid] = call
    persistActiveCallDescriptors()

    provider.reportNewIncomingCall(with: callUuid, update: update) { [weak self] error in
      if let error {
        self?.removeCall(callUuid)
        self?.emit(type: "reportFailed", call: call, reason: String(describing: type(of: error)))
        completion?(error)
        return
      }
      self?.emit(type: "incoming", call: call)
      let serverRemainder = expiresAt?.timeIntervalSinceNow ?? 45
      let timeoutSeconds = min(45, max(0.1, serverRemainder))
      DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds, execute: timeoutWorkItem)
      completion?(nil)
    }
    return callUuid
  }

  private func normalizedCallAction(_ payload: [String: Any]) -> String {
    let action = toText(payload["action"]).lowercased()
    let terminalAction = toText(payload["callAction"]).lowercased()
    if [
      "incoming",
      "cancel",
      "declined",
      "end",
      "timeout",
      "missed",
    ].contains(terminalAction) {
      return terminalAction
    }
    if ["cancel", "declined", "end", "timeout", "missed"].contains(action) {
      return action
    }
    return "incoming"
  }

  private func callActionLabel(_ payload: [String: Any]) -> String {
    switch normalizedCallAction(payload) {
    case "cancel":
      return "cancel"
    case "declined":
      return "declined"
    case "end":
      return "end"
    case "timeout":
      return "timeout"
    case "missed":
      return "missed"
    default:
      return "incoming"
    }
  }

  private func findActiveCall(
    input: [String: Any]
  ) -> ActiveNativeCall? {
    if
      let callUuidText = input["callUuid"] as? String,
      let callUuid = UUID(uuidString: callUuidText),
      let call = activeCalls[callUuid]
    {
      return call
    }
    guard let inviteId = input["callInviteId"] as? String, !inviteId.isEmpty else { return nil }
    return activeCalls.values.first(where: { $0.inviteId == inviteId })
  }

  private func resolveCallUuid(
    input: [String: Any],
    fallbackInviteId: String?
  ) -> UUID? {
    if
      let callUuidText = input["callUuid"] as? String,
      let callUuid = UUID(uuidString: callUuidText)
    {
      return callUuid
    }
    guard let inviteId = fallbackInviteId ?? (input["callInviteId"] as? String),
          !inviteId.isEmpty else { return nil }
    return activeCalls.values.first(where: { $0.inviteId == inviteId })?.uuid
  }

  private func handleTerminalVoipAction(
    input: [String: Any],
    action: String,
    completion: @escaping () -> Void,
  ) {
    let inviteId = toText(input["callInviteId"])
    let threadId = toText(input["threadId"])
    if inviteId.isEmpty || threadId.isEmpty {
      markTerminalInvite(inviteId)
      completion()
      return
    }
    if isTerminalInvite(inviteId) {
      completion()
      return
    }
    guard
      let callUuid = resolveCallUuid(input: input, fallbackInviteId: inviteId),
      let call = activeCalls[callUuid]
    else {
      markTerminalInvite(inviteId)
      completion()
      return
    }
    failPendingAnswer(callUuid)
    let eventType = action == "declined" || action == "timeout" || action == "missed"
      ? action == "declined" ? "declined" : action
      : "ended"
    provider?.reportCall(with: callUuid, endedAt: Date(), reason: .remoteEnded)
    _ = removeCall(callUuid)
    markTerminalInvite(call.inviteId)
    emit(type: eventType, call: call, reason: action)
    completion()
  }

  public func endCall(callUuid: String, reason: String) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    requestedEndReasons[uuid] = reason
    let action = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: action)
    callController.request(transaction) { [weak self] error in
      if error != nil {
        DispatchQueue.main.async {
          if let call = self?.removeCall(uuid) {
            self?.requestedEndReasons.removeValue(forKey: uuid)
            self?.markTerminalInvite(call.inviteId)
            self?.provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            self?.emit(type: reason.hasPrefix("invite_") ? "remoteEnded" : "ended", call: call, reason: reason)
          }
        }
      }
    }
  }

  public func reportRemoteEnd(callUuid: String, reason: String) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    DispatchQueue.main.async { [weak self] in
      guard let self, let call = self.removeCall(uuid) else { return }
      self.markTerminalInvite(call.inviteId)
      self.failPendingAnswer(uuid)
      self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
      self.emit(type: "remoteEnded", call: call, reason: reason)
    }
  }

  public func completeAnswer(callUuid: String, connected: Bool) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    DispatchQueue.main.async { [weak self] in
      self?.completeAnswerOnMain(uuid, connected: connected, reason: connected ? "media_connected" : "media_connection_failed")
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
      let persistedEvents = UserDefaults.standard.array(forKey: pendingEventsDefaultsKey) as? [[String: Any]] ?? []
      let events = persistedEvents + pendingEvents
      pendingEvents.removeAll()
      UserDefaults.standard.removeObject(forKey: pendingEventsDefaultsKey)
      return events
    }
  }

  private func completeAnswerOnMain(_ uuid: UUID, connected: Bool, reason: String) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let action = pendingAnswerActions.removeValue(forKey: uuid) else { return }
    pendingAnswerTimeouts.removeValue(forKey: uuid)?.cancel()
    guard var call = activeCalls[uuid] else {
      action.fail()
      return
    }

    if connected {
      call.answered = true
      activeCalls[uuid] = call
      persistActiveCallDescriptors()
      action.fulfill()
      emit(type: "answered", call: call, reason: reason)
      return
    }

    action.fail()
    markTerminalInvite(call.inviteId)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
    _ = removeCall(uuid)
    emit(type: "answerFailed", call: call, reason: reason)
  }

  private func failPendingAnswer(_ uuid: UUID) {
    pendingAnswerTimeouts.removeValue(forKey: uuid)?.cancel()
    pendingAnswerActions.removeValue(forKey: uuid)?.fail()
  }

  private func persistActiveCallDescriptors() {
    let descriptors = activeCalls.values.map { call in
      var descriptor: [String: Any] = [
        "callUuid": call.uuid.uuidString.lowercased(),
        "callInviteId": call.inviteId,
        "threadId": call.threadId,
        "callType": call.callType,
        "answered": call.answered,
      ]
      if let expiresAt = call.expiresAt {
        descriptor["expiresAt"] = ISO8601DateFormatter().string(from: expiresAt)
      }
      return descriptor
    }
    UserDefaults.standard.set(descriptors, forKey: activeCallsDefaultsKey)
  }

  private func restoreActiveCallDescriptors() {
    dispatchPrecondition(condition: .onQueue(.main))
    let systemCallUuids = Set(CXCallObserver().calls.map(\.uuid))
    let descriptors = UserDefaults.standard.array(forKey: activeCallsDefaultsKey) as? [[String: Any]] ?? []
    for descriptor in descriptors {
      guard
        let uuidText = descriptor["callUuid"] as? String,
        let uuid = UUID(uuidString: uuidText),
        systemCallUuids.contains(uuid),
        let inviteId = descriptor["callInviteId"] as? String,
        !inviteId.isEmpty,
        let threadId = descriptor["threadId"] as? String,
        !threadId.isEmpty
      else { continue }
      var restoredCall = ActiveNativeCall(
        uuid: uuid,
        inviteId: inviteId,
        threadId: threadId,
        callType: descriptor["callType"] as? String == "video" ? "video" : "voice",
        expiresAt: parseServerDate(descriptor["expiresAt"]),
        answered: descriptor["answered"] as? Bool == true,
        timeoutWorkItem: nil
      )
      if !restoredCall.answered {
        let timeout = DispatchWorkItem { [weak self] in self?.timeoutCall(uuid) }
        restoredCall.timeoutWorkItem = timeout
        let serverRemainder = restoredCall.expiresAt?.timeIntervalSinceNow ?? 1
        DispatchQueue.main.asyncAfter(
          deadline: .now() + min(45, max(0.1, serverRemainder)),
          execute: timeout
        )
      }
      activeCalls[uuid] = restoredCall
    }
    persistActiveCallDescriptors()
    activeCalls.values.forEach { emit(type: "recovered", call: $0) }
  }

  private func timeoutCall(_ uuid: UUID) {
    guard let call = activeCalls[uuid], !call.answered else { return }
    failPendingAnswer(uuid)
    markTerminalInvite(call.inviteId)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    _ = removeCall(uuid)
    emit(type: "timeout", call: call, reason: "unanswered")
  }

  @discardableResult
  private func removeCall(_ uuid: UUID) -> ActiveNativeCall? {
    guard let call = activeCalls.removeValue(forKey: uuid) else { return nil }
    call.timeoutWorkItem?.cancel()
    persistActiveCallDescriptors()
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
          // PushKit tokens remain memory-only. Bounded non-token lifecycle
          // events are persisted so a VoIP-launched process can hand CallKit
          // state to React Native after a cold start without persisting any
          // credential value.
          if event["token"] != nil {
            self.pendingEvents.append(event)
            if self.pendingEvents.count > 32 { self.pendingEvents.removeFirst() }
          } else {
            var persisted = UserDefaults.standard.array(forKey: self.pendingEventsDefaultsKey) as? [[String: Any]] ?? []
            persisted.append(event)
            if persisted.count > 32 { persisted.removeFirst(persisted.count - 32) }
            UserDefaults.standard.set(persisted, forKey: self.pendingEventsDefaultsKey)
          }
        }
      }
    }
  }

  private func terminalInvites() -> [String: TimeInterval] {
    let cutoff = Date().addingTimeInterval(-600).timeIntervalSince1970
    let stored = UserDefaults.standard.dictionary(forKey: terminalInvitesDefaultsKey) as? [String: TimeInterval] ?? [:]
    return stored.filter { $0.value >= cutoff }
  }

  private func isTerminalInvite(_ inviteId: String) -> Bool {
    let current = terminalInvites()
    UserDefaults.standard.set(current, forKey: terminalInvitesDefaultsKey)
    return current[inviteId] != nil
  }

  private func markTerminalInvite(_ inviteId: String) {
    guard !inviteId.isEmpty else { return }
    var current = terminalInvites()
    current[inviteId] = Date().timeIntervalSince1970
    UserDefaults.standard.set(current, forKey: terminalInvitesDefaultsKey)
  }

  private func reportInvalidVoipPushOnMain(completion: @escaping () -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    prepare()
    guard let provider else {
      completion()
      return
    }

    let callUuid = UUID()
    let inviteId = "invalid-\(callUuid.uuidString.lowercased())"
    let call = ActiveNativeCall(
      uuid: callUuid,
      inviteId: inviteId,
      threadId: "invalid",
      callType: "voice",
      expiresAt: Date(),
      answered: false,
      timeoutWorkItem: nil
    )
    activeCalls[callUuid] = call
    persistActiveCallDescriptors()

    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: "Unavailable call")
    update.localizedCallerName = "Unavailable call"
    update.hasVideo = false
    provider.reportNewIncomingCall(with: callUuid, update: update) { [weak self] _ in
      guard let self else {
        completion()
        return
      }
      self.provider?.reportCall(with: callUuid, endedAt: Date(), reason: .failed)
      _ = self.removeCall(callUuid)
      self.markTerminalInvite(inviteId)
      self.emit(type: "invalidIncomingPayload", call: call)
      completion()
    }
  }

  // MARK: - PushKit

  public func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP, persistedVoipAuthority() != nil else { return }
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
    guard isBuildEnabled, isRuntimeDefaultEnabled else {
      reportInvalidVoipPushOnMain(completion: completion)
      return
    }
    do {
      let normalizedPayload = payload.dictionaryPayload.reduce(into: [String: Any]()) { result, entry in
        guard let key = entry.key as? String else { return }
        result[key] = entry.value
      }
      guard voipPayloadMatchesPersistedAuthority(normalizedPayload) else {
        reportInvalidVoipPushOnMain(completion: completion)
        return
      }
      let action = callActionLabel(normalizedPayload)
      if action == "incoming" {
        _ = try reportIncomingCallOnMain(payload: normalizedPayload) { _ in
          completion()
        }
        return
      }
      handleTerminalVoipAction(
        input: normalizedPayload,
        action: action,
        completion: completion,
      )
    } catch {
      reportInvalidVoipPushOnMain(completion: completion)
    }
  }

  // MARK: - CallKit

  public func providerDidReset(_ provider: CXProvider) {
    let calls = activeCalls.values
    activeCalls.removeAll()
    calls.forEach {
      $0.timeoutWorkItem?.cancel()
      failPendingAnswer($0.uuid)
      markTerminalInvite($0.inviteId)
      emit(type: "providerReset", call: $0)
    }
    persistActiveCallDescriptors()
    deactivateAudioSession()
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard let call = activeCalls[action.callUUID] else {
      action.fail()
      return
    }
    call.timeoutWorkItem?.cancel()
    pendingAnswerActions[action.callUUID] = action
    let timeout = DispatchWorkItem { [weak self] in
      self?.completeAnswerOnMain(action.callUUID, connected: false, reason: "media_connection_timeout")
    }
    pendingAnswerTimeouts[action.callUUID]?.cancel()
    pendingAnswerTimeouts[action.callUUID] = timeout
    let timeoutDelay = max(0.5, action.timeoutDate.timeIntervalSinceNow - 0.25)
    DispatchQueue.main.asyncAfter(deadline: .now() + timeoutDelay, execute: timeout)
    emit(type: "answerRequested", call: call)
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let call = removeCall(action.callUUID) else {
      action.fulfill()
      return
    }
    failPendingAnswer(action.callUUID)
    markTerminalInvite(call.inviteId)
    let requestedReason = requestedEndReasons.removeValue(forKey: action.callUUID)
    if let requestedReason, requestedReason.hasPrefix("invite_") {
      emit(type: "remoteEnded", call: call, reason: requestedReason)
    } else {
      emit(type: call.answered ? "ended" : "declined", call: call, reason: requestedReason)
    }
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
      if activeCalls.isEmpty {
        emitRaw(["type": "audioSessionFailed"])
      } else {
        activeCalls.values.forEach { emit(type: "audioSessionFailed", call: $0) }
      }
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

    let eventType = interruptionType == .began
      ? "audioInterruptionBegan"
      : "audioInterruptionEnded"
    if activeCalls.isEmpty {
      emitRaw(["type": eventType])
    } else {
      activeCalls.values.forEach { emit(type: eventType, call: $0) }
    }
  }
}
