import AVFAudio
import CallKit
import Foundation
import PushKit
import UIKit

enum ChillywoodNativeCallError: Error {
  case buildDisabled
  case debugTriggerUnavailable
  case invalidCallUuid
  case invalidPayload
  case answerNotPending
  case callUnavailable
  case providerUnavailable
  case runtimeDisabled
  case applicationNotActive
  case unsupportedAudioRoute
}

private struct ActiveNativeCall {
  let generation = UUID()
  let uuid: UUID
  let inviteId: String
  let threadId: String
  let callType: String
  let ringingDeadline: ChillywoodIncomingCallDeadline?
  var answered: Bool
  var timeoutWorkItem: DispatchWorkItem?
  var presentationConfirmed = false
  var presentationAuthority: NativeVoipAuthority? = nil
}

private struct NativeVoipAuthority: Codable, Equatable, Sendable {
  let userId: String
  let accountId: String
  let sessionGeneration: String
  let installId: String
}

private struct PendingIncomingReport {
  let generation: UUID
  var completions: [(Error?) -> Void]
}

public final class ChillywoodNativeCallCoordinator: NSObject, CXProviderDelegate, PKPushRegistryDelegate, @unchecked Sendable {
  public static let shared = ChillywoodNativeCallCoordinator()

  private let callController = CXCallController()
  private let stateQueue = DispatchQueue(label: "com.chillywood.native-calls.state")
  private let pendingEventsDefaultsKey = "com.chillywood.native-calls.pending-events.v1"
  private let pendingAnswerEventsDefaultsKey = "com.chillywood.native-calls.pending-answer-events.v1"
  private let terminalInvitesDefaultsKey = "com.chillywood.native-calls.terminal-invites.v1"
  private let activeCallsDefaultsKey = "com.chillywood.native-calls.active-descriptors.v1"
  private let voipAuthorityDefaultsKey = "com.chillywood.native-calls.session-authority.v1"
  private let presentationAckHost = "bmkkhihfbmsnnmcqkoly.supabase.co"
  private var provider: CXProvider?
  private let audioSessionDiagnostics = ChillywoodNativeCallDiagnostics.shared
  // Process-memory CallKit ownership only. Never restored from preferences.
  private var callKitAudioSessionActive = false
  private var callKitAudioActivationOwners: [UUID: (generation: UUID, authority: NativeVoipAuthority)] = [:]
  private var pushRegistry: PKPushRegistry?
  private var activeCalls: [UUID: ActiveNativeCall] = [:]
  private var pendingIncomingReports: [UUID: PendingIncomingReport] = [:]
  private var requestedAnswerTransactions: Set<UUID> = []
  private var requestedAnswerCompletions: [UUID: [(Result<Void, Error>) -> Void]] = [:]
  private var pendingAnswerActions: [UUID: CXAnswerCallAction] = [:]
  private var pendingAnswerTimeouts: [UUID: DispatchWorkItem] = [:]
  private var answerTransitionBackgroundTasks: [UUID: UIBackgroundTaskIdentifier] = [:]
  private var answerTransitionBackgroundTaskTimeouts: [UUID: DispatchWorkItem] = [:]
  private var requestedEndReasons: [UUID: String] = [:]
  private var terminalTransitionBackgroundTasks: [UUID: UIBackgroundTaskIdentifier] = [:]
  private var terminalTransitionBackgroundTaskTimeouts: [UUID: DispatchWorkItem] = [:]
  private var pendingEvents: [[String: Any]] = []
  private var audioSessionObservers: [NSObjectProtocol] = []
  private lazy var presentationAckSession: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 3
    configuration.timeoutIntervalForResource = 4
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
  }()
  private var prepared = false

  public var eventSink: (([String: Any]) -> Void)? {
    didSet {
      guard eventSink != nil else { return }
      // Expo calls OnStartObserving while the JavaScript subscription is still
      // being installed. Draining synchronously here can delete a persisted
      // CallKit Answer before JavaScript is able to receive it. Defer exactly
      // one main-queue turn; the explicit getPendingEventsAsync fallback may
      // win first, and either path drains the same bounded queue only once.
      DispatchQueue.main.async { [weak self] in
        guard let self, let eventSink = self.eventSink else { return }
        self.drainPendingEvents().forEach { eventSink($0) }
      }
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
    ChillywoodNativeCallDiagnostics.shared.record(.lifecyclePrepared)
    guard isBuildEnabled else { return }
    prepare()
    guard isRuntimeDefaultEnabled, persistedVoipAuthority() != nil else {
      ChillywoodNativeCallDiagnostics.shared.record(.coldStartAuthorityRejected)
      return
    }
    ChillywoodNativeCallDiagnostics.shared.record(.coldStartAuthorityAccepted)
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
    ChillywoodNativeCallDiagnostics.shared.record(.registrationStartReceived)
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
        ChillywoodNativeCallDiagnostics.shared.record(.registrationAuthorityReplaced)
        self.resetAccountContextOnMain()
        self.pushRegistry?.desiredPushTypes = []
        self.pushRegistry?.delegate = nil
        self.pushRegistry = nil
      }
      self.persistVoipAuthority(authority)
      self.prepare()
      self.startVoipRegistrationOnMain()
      self.emitCurrentVoipTokenOnMain()
      // JS may suspend readiness while preserving this same native registry.
      // Rebinding must restore actual confirmed ownership into its new
      // listener without minting an Answer or reporting another system call.
      self.recoverConfirmedIncomingCallsOnMain()
      ChillywoodNativeCallDiagnostics.shared.record(.registrationStarted)
    }
    if Thread.isMainThread { configure() }
    else { DispatchQueue.main.sync(execute: configure) }
  }

  private func startVoipRegistrationOnMain() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard isBuildEnabled, isRuntimeDefaultEnabled else { return }
    guard pushRegistry == nil else {
      ChillywoodNativeCallDiagnostics.shared.record(.registryReused)
      return
    }
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    pushRegistry = registry
    ChillywoodNativeCallDiagnostics.shared.record(.registryCreated)
  }

  private func recoverConfirmedIncomingCallsOnMain() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let authority = persistedVoipAuthority() else { return }
    let liveCallUuids = Set(CXCallObserver().calls.filter { !$0.hasEnded }.map(\.uuid))
    for call in Array(activeCalls.values) {
      guard call.presentationConfirmed, call.presentationAuthority == authority,
        activeCalls[call.uuid]?.generation == call.generation,
        liveCallUuids.contains(call.uuid), !isTerminalInvite(call.inviteId),
        call.ringingDeadline?.wakeup(now: Date(), ownsCall: true, answered: call.answered,
          answerPending: pendingAnswerActions[call.uuid] != nil) != .expire
      else { continue }
      emit(type: "recovered", call: call)
    }
  }

  private func emitCurrentVoipTokenOnMain() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard persistedVoipAuthority() != nil, let token = pushRegistry?.pushToken(for: .voIP), !token.isEmpty else { return }
    // PushKit need not issue a new callback when the same registry is reused.
    // Replay its actual current token to the new JS lifecycle, memory-only.
    emitRaw(["type": "voipTokenUpdated", "token": token.map { String(format: "%02x", $0) }.joined()])
  }

  public func stopVoipRegistration() {
    ChillywoodNativeCallDiagnostics.shared.record(.registrationStopReceived)
    let stop = { [weak self] in
      guard let self else { return }
      UserDefaults.standard.removeObject(forKey: self.voipAuthorityDefaultsKey)
      self.resetAccountContextOnMain()
      self.pushRegistry?.desiredPushTypes = []
      self.pushRegistry?.delegate = nil
      self.pushRegistry = nil
      ChillywoodNativeCallDiagnostics.shared.record(.registrationStopped)
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
    drainIncomingReports()
    requestedAnswerTransactions.removeAll()
    requestedAnswerCompletions.values.flatMap { $0 }.forEach {
      $0(.failure(ChillywoodNativeCallError.callUnavailable))
    }
    requestedAnswerCompletions.removeAll()
    pendingAnswerActions.values.forEach { $0.fail() }
    pendingAnswerActions.removeAll()
    pendingAnswerTimeouts.values.forEach { $0.cancel() }
    pendingAnswerTimeouts.removeAll()
    endAllAnswerTransitionBackgroundTasks()
    requestedEndReasons.removeAll()
    endAllTerminalTransitionBackgroundTasks()
    UserDefaults.standard.removeObject(forKey: activeCallsDefaultsKey)
    UserDefaults.standard.removeObject(forKey: terminalInvitesDefaultsKey)
    stateQueue.sync {
      pendingEvents.removeAll()
      UserDefaults.standard.removeObject(forKey: pendingEventsDefaultsKey)
      UserDefaults.standard.removeObject(forKey: pendingAnswerEventsDefaultsKey)
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

  private func acknowledgeIncomingCallPresentation(
    payload: [String: Any],
    callUuid: UUID,
    inviteId: String
  ) {
    guard
      let authority = persistedVoipAuthority(),
      let attemptId = payload["presentationAttemptId"] as? String,
      UUID(uuidString: attemptId) != nil,
      let token = payload["presentationAckToken"] as? String,
      token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
      let urlText = payload["presentationAckUrl"] as? String,
      let url = URL(string: urlText),
      url.scheme?.lowercased() == "https",
      url.host?.lowercased() == presentationAckHost,
      url.port == nil || url.port == 443,
      url.user == nil,
      url.password == nil,
      url.query == nil,
      url.fragment == nil,
      url.path.hasSuffix("/functions/v1/ios-voip-call-dispatch")
    else { return }

    let body: [String: String] = [
      "action": "presentation_ack",
      "inviteId": inviteId,
      "presentationAckToken": token,
      "presentationAttemptId": attemptId.lowercased(),
      "recipientUserId": authority.userId,
    ]
    guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = bodyData
    request.timeoutInterval = 3
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    sendPresentationAcknowledgementRequest(
      request,
      callUuid: callUuid,
      inviteId: inviteId,
      retry: 0
    )
  }

  private func sendPresentationAcknowledgementRequest(
    _ request: URLRequest,
    callUuid: UUID,
    inviteId: String,
    retry: Int
  ) {
    presentationAckSession.dataTask(with: request) { [weak self] _, response, error in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard (error != nil || status >= 500 || status == 0), retry < 1 else { return }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
        guard let self, self.activeCalls[callUuid]?.inviteId == inviteId else { return }
        self.sendPresentationAcknowledgementRequest(
          request,
          callUuid: callUuid,
          inviteId: inviteId,
          retry: retry + 1
        )
      }
    }.resume()
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
          _ = try self.reportIncomingCallOnMain(payload: payload) { error in
            if let error { continuation.resume(throwing: error) }
            else if let call = self.findActiveCall(input: payload), call.presentationConfirmed {
              continuation.resume(returning: call.uuid.uuidString.lowercased())
            } else { continuation.resume(throwing: ChillywoodNativeCallError.callUnavailable) }
          }
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  public func reportForegroundIncomingCall(
    payload: [String: Any],
    authority: [String: Any]
  ) async throws -> String {
    let diagnosticUuid = (payload["callUuid"] as? String).flatMap(UUID.init(uuidString:))
    ChillywoodNativeCallDiagnostics.shared.record(.foregroundReportReceived, callUuid: diagnosticUuid)
    return try await withCheckedThrowingContinuation { continuation in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          continuation.resume(throwing: ChillywoodNativeCallError.callUnavailable)
          return
        }
        do {
          let safePayload = try self.foregroundIncomingPayload(payload, authority: authority)
          self.prepare()
          _ = try self.reportIncomingCallOnMain(payload: safePayload) { error in
            if let error {
              ChillywoodNativeCallDiagnostics.shared.record(.foregroundReportRejected, callUuid: diagnosticUuid, error: error)
              continuation.resume(throwing: error)
              return
            }
            do {
              // Neither a main-queue delay nor CallKit's completion may grant
              // an old account or a now-background screen Answer authority.
              _ = try self.foregroundIncomingPayload(payload, authority: authority)
              guard let call = self.findActiveCall(input: safePayload), call.presentationConfirmed else {
                throw ChillywoodNativeCallError.callUnavailable
              }
              continuation.resume(returning: call.uuid.uuidString.lowercased())
            } catch {
              ChillywoodNativeCallDiagnostics.shared.record(.foregroundReportRejected, callUuid: diagnosticUuid, error: error)
              continuation.resume(throwing: error)
            }
          }
        } catch {
          ChillywoodNativeCallDiagnostics.shared.record(.foregroundReportRejected, callUuid: diagnosticUuid, error: error)
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func foregroundIncomingPayload(
    _ payload: [String: Any],
    authority inputAuthority: [String: Any]
  ) throws -> [String: Any] {
    dispatchPrecondition(condition: .onQueue(.main))
    guard isBuildEnabled else { throw ChillywoodNativeCallError.buildDisabled }
    guard isRuntimeDefaultEnabled else { throw ChillywoodNativeCallError.runtimeDisabled }
    guard UIApplication.shared.applicationState == .active else {
      throw ChillywoodNativeCallError.applicationNotActive
    }
    let authority = NativeVoipAuthority(
      userId: toText(inputAuthority["userId"]), accountId: toText(inputAuthority["accountId"]),
      sessionGeneration: toText(inputAuthority["sessionGeneration"]), installId: toText(inputAuthority["installId"])
    )
    guard isValidVoipAuthority(authority), persistedVoipAuthority() == authority else {
      throw ChillywoodNativeCallError.invalidPayload
    }
    let inviteId = toText(payload["callInviteId"]).lowercased()
    let callUuid = toText(payload["callUuid"]).lowercased()
    let threadId = toText(payload["threadId"]).lowercased()
    let callType = toText(payload["callType"])
    let expiry = (payload["expiresAt"] as? String) ?? ""
    guard UUID(uuidString: inviteId) != nil, callUuid == inviteId,
      UUID(uuidString: threadId) != nil, ["voice", "video"].contains(callType),
      let deadline = ChillywoodIncomingCallDeadline(serverExpiresAt: parseForegroundServerDate(expiry), now: Date()),
      deadline.wakeup(now: Date(), ownsCall: true, answered: false, answerPending: false) != .expire,
      !isTerminalInvite(inviteId)
    else { throw ChillywoodNativeCallError.invalidPayload }
    // Foreground UI never receives or fabricates a server presentation-ack
    // capability. Only the actual PushKit callback owns that payload.
    let callerName = String(toText(payload["callerName"]).prefix(80))
    return ["callInviteId": inviteId, "callUuid": callUuid, "threadId": threadId,
      "callType": callType, "expiresAt": expiry,
      "callerName": callerName.isEmpty ? "Chi'llywood caller" : callerName]
  }

  #if DEBUG
  public func reportDebugIncomingCall(payload: [String: Any]) async throws -> String {
    var debugPayload = payload
    debugPayload["callInviteId"] = (payload["callInviteId"] as? String) ?? "local-debug-invite"
    debugPayload["threadId"] = (payload["threadId"] as? String) ?? "local-debug-thread"
    debugPayload["callerName"] = (payload["callerName"] as? String) ?? "Chi'llywood Test Caller"
    debugPayload["callType"] = (payload["callType"] as? String) ?? "voice"
    debugPayload["expiresAt"] = payload["expiresAt"]
      ?? ISO8601DateFormatter().string(from: Date().addingTimeInterval(90))
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

  private func parseForegroundServerDate(_ text: String) -> Date? {
    // ISO8601DateFormatter can normalize invalid calendar components. A new
    // foreground presentation must reject those inputs rather than silently
    // granting a different deadline (legacy restore parsing stays separate).
    let pattern = "^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\\.[0-9]{1,6})?(Z|[+-]([0-9]{2}):([0-9]{2}))$"
    guard let expression = try? NSRegularExpression(pattern: pattern),
      let match = expression.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
      match.range.length == text.utf16.count
    else { return nil }
    let value = text as NSString
    func integer(_ index: Int) -> Int? {
      let range = match.range(at: index)
      return range.location == NSNotFound ? nil : Int(value.substring(with: range))
    }
    guard let year = integer(1), year > 0, let month = integer(2), (1...12).contains(month),
      let day = integer(3), let hour = integer(4), hour < 24,
      let minute = integer(5), minute < 60, let second = integer(6), second < 60
    else { return nil }
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
    let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    guard day >= 1, day <= days[month - 1] else { return nil }
    if let offsetHour = integer(8) {
      guard offsetHour < 24, let offsetMinute = integer(9), offsetMinute < 60 else { return nil }
    }
    return parseServerDate(text)
  }

  private func toText(_ value: Any?) -> String {
    guard let text = value as? String else { return "" }
    return text.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func reportIncomingCallOnMain(
    payload: [String: Any],
    requiresPushReport: Bool = false,
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
    let callType = payload["callType"] as? String == "video" ? "video" : "voice"
    let authority = persistedVoipAuthority()
    if let existing = activeCalls[callUuid] ?? activeCalls.values.first(where: { $0.inviteId == inviteId }) {
      guard existing.uuid == callUuid || suppliedUuid == nil,
        existing.inviteId == inviteId, existing.threadId == threadId,
        existing.callType == callType, existing.presentationAuthority == authority
      else { throw ChillywoodNativeCallError.invalidPayload }
      if requiresPushReport {
        try reportDuplicateVoipPushOnMain(payload: payload, call: existing, completion: completion)
        return existing.uuid
      }
      if existing.presentationConfirmed {
        guard CXCallObserver().calls.contains(where: { $0.uuid == existing.uuid && !$0.hasEnded }),
          existing.ringingDeadline?.wakeup(now: Date(), ownsCall: true, answered: existing.answered,
            answerPending: pendingAnswerActions[existing.uuid] != nil) != .expire
        else { throw ChillywoodNativeCallError.callUnavailable }
        // A confirmed native descriptor may outlive a JS listener. Recovery is
        // an actual native ownership receipt, never a map fabricated by JS.
        emit(type: "recovered", call: existing)
        completion?(nil)
      } else {
        guard var pending = pendingIncomingReports[existing.uuid], pending.generation == existing.generation else {
          throw ChillywoodNativeCallError.callUnavailable
        }
        if let completion { pending.completions.append(completion) }
        pendingIncomingReports[existing.uuid] = pending
      }
      return existing.uuid
    }
    guard let provider else { throw ChillywoodNativeCallError.providerUnavailable }
    guard let ringingDeadline = ChillywoodIncomingCallDeadline(
      serverExpiresAt: parseServerDate(payload["expiresAt"]),
      now: Date()
    ), ringingDeadline.wakeup(now: Date(), ownsCall: true, answered: false, answerPending: false) != .expire
    else { throw ChillywoodNativeCallError.invalidPayload }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: (payload["callerName"] as? String) ?? "Chi'llywood caller")
    update.localizedCallerName = (payload["callerName"] as? String) ?? "Chi'llywood caller"
    update.hasVideo = callType == "video"
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false

    let call = ActiveNativeCall(
      uuid: callUuid,
      inviteId: inviteId,
      threadId: threadId,
      callType: callType,
      ringingDeadline: ringingDeadline,
      answered: false,
      timeoutWorkItem: nil,
      presentationAuthority: authority
    )
    activeCalls[callUuid] = call
    pendingIncomingReports[callUuid] = PendingIncomingReport(
      generation: call.generation, completions: completion.map { [$0] } ?? []
    )
    // An OS callback that never arrives must not leave a pending presentation
    // or checked continuation alive beyond the authoritative invite deadline.
    timeoutCall(callUuid, generation: call.generation)

    ChillywoodNativeCallDiagnostics.shared.record(.incomingReportRequested, callUuid: callUuid)
    provider.reportNewIncomingCall(with: callUuid, update: update) { [weak self] error in
      ChillywoodNativeCallDiagnostics.shared.record(
        error == nil ? .incomingReportSucceeded : .incomingReportFailed,
        callUuid: callUuid, error: error
      )
      DispatchQueue.main.async {
        guard let self else { return }
        guard var current = self.activeCalls[callUuid], current.generation == call.generation else {
          // A delayed successful OS report can follow cancellation/reset. End
          // only its orphaned UUID; never touch a replacement generation.
          if error == nil && self.activeCalls[callUuid] == nil {
            self.provider?.reportCall(with: callUuid, endedAt: Date(), reason: .remoteEnded)
          }
          return
        }
        if let error {
          self.failPendingAnswer(callUuid)
          self.removeCall(callUuid, incomingReportError: error)
          self.emit(type: "reportFailed", call: call, reason: String(describing: type(of: error)))
          return
        }
        guard current.presentationAuthority == self.persistedVoipAuthority(),
          !self.isTerminalInvite(inviteId),
          current.ringingDeadline?.wakeup(now: Date(), ownsCall: true, answered: current.answered,
            answerPending: self.pendingAnswerActions[callUuid] != nil) != .expire
        else {
          self.provider?.reportCall(with: callUuid, endedAt: Date(), reason: .remoteEnded)
          self.removeCall(callUuid)
          return
        }
        current.presentationConfirmed = true
        self.activeCalls[callUuid] = current
        self.persistActiveCallDescriptors()
        self.emit(type: "incoming", call: current)
        self.timeoutCall(callUuid, generation: call.generation)
        self.settleIncomingReport(callUuid, generation: call.generation, error: nil)
      }
    }
    return callUuid
  }

  private func reportDuplicateVoipPushOnMain(
    payload: [String: Any],
    call: ActiveNativeCall,
    completion: ((Error?) -> Void)?
  ) throws {
    dispatchPrecondition(condition: .onQueue(.main))
    guard let provider else { throw ChillywoodNativeCallError.providerUnavailable }
    // Foreground callers may share a presentation, but the legacy PushKit
    // delegate must issue a CallKit report for EACH received VoIP push. An
    // existing UUID is expected to be rejected as already present; that error
    // must never remove the established call or fail its pending Answer.
    var presentationResult: Result<Void, Error>?
    var pushReportResult: Result<Void, Error>?
    var completed = false
    func settle() {
      guard !completed, let presentationResult, let pushReportResult else { return }
      completed = true
      let current = activeCalls[call.uuid]
      let ownsCall = current?.generation == call.generation
        && current?.presentationAuthority == call.presentationAuthority
        && persistedVoipAuthority() == call.presentationAuthority
      // A successful duplicate report can finish after the original report
      // failed or its owner retired. Close only an orphan, never a replacement
      // generation (nor a healthy call on the expected duplicate error).
      if case .success = pushReportResult, current == nil {
        provider.reportCall(with: call.uuid, endedAt: Date(), reason: .remoteEnded)
      }
      guard ownsCall, current?.presentationConfirmed == true,
        !isTerminalInvite(call.inviteId),
        CXCallObserver().calls.contains(where: { $0.uuid == call.uuid && !$0.hasEnded })
      else { completion?(ChillywoodNativeCallError.callUnavailable); return }
      if case .failure(let error) = presentationResult { completion?(error); return }
      if case .failure(let error) = pushReportResult {
        let nativeError = error as NSError
        guard nativeError.domain == CXErrorDomainIncomingCall,
          nativeError.code == CXErrorCodeIncomingCallError.callUUIDAlreadyExists.rawValue
        else { completion?(error); return }
      }
      completion?(nil)
    }
    // Attach to the immutable original generation before issuing the duplicate
    // report. Either callback order is valid; neither alone grants ownership.
    _ = try reportIncomingCallOnMain(payload: payload) { error in
      guard presentationResult == nil else { return }
      presentationResult = error.map { .failure($0) } ?? .success(())
      settle()
    }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: (payload["callerName"] as? String) ?? "Chi'llywood caller")
    update.localizedCallerName = (payload["callerName"] as? String) ?? "Chi'llywood caller"
    update.hasVideo = call.callType == "video"
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    update.supportsDTMF = false
    ChillywoodNativeCallDiagnostics.shared.record(.incomingReportRequested, callUuid: call.uuid)
    provider.reportNewIncomingCall(with: call.uuid, update: update) { error in
      ChillywoodNativeCallDiagnostics.shared.record(
        error == nil ? .incomingReportSucceeded : .incomingReportFailed,
        callUuid: call.uuid, error: error
      )
      DispatchQueue.main.async {
        guard pushReportResult == nil else { return }
        pushReportResult = error.map { .failure($0) } ?? .success(())
        settle()
      }
    }
  }

  private func settleIncomingReport(_ uuid: UUID, generation: UUID?, error: Error?) {
    guard let pending = pendingIncomingReports[uuid], generation == nil || pending.generation == generation else { return }
    // Remove before invoking consumers: a completion may itself end/reset the
    // call or submit another request for the same UUID.
    pendingIncomingReports.removeValue(forKey: uuid)
    pending.completions.forEach { $0(error) }
  }

  private func drainIncomingReports() {
    let pending = Array(pendingIncomingReports.keys)
    pending.forEach { settleIncomingReport($0, generation: nil, error: ChillywoodNativeCallError.callUnavailable) }
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
    completion: @escaping () -> Void
  ) {
    let inviteId = toText(input["callInviteId"])
    let threadId = toText(input["threadId"])
    if inviteId.isEmpty || threadId.isEmpty {
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
    guard call.inviteId == inviteId, call.threadId == threadId,
      call.callType == (input["callType"] as? String == "video" ? "video" : "voice"),
      call.presentationAuthority == persistedVoipAuthority()
    else {
      // A UUID lookup alone is not terminal authority. A conflicting payload
      // must neither end another descriptor nor tombstone its valid invite.
      completion()
      return
    }
    failPendingAnswer(callUuid)
    let eventType = action == "declined" || action == "timeout" || action == "missed"
      ? action == "declined" ? "declined" : action
      : "ended"
    provider?.reportCall(with: callUuid, endedAt: Date(), reason: .remoteEnded)
    markTerminalInvite(call.inviteId)
    _ = removeCall(callUuid)
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
          if let self, let call = self.activeCalls[uuid] {
            self.markTerminalInvite(call.inviteId)
            _ = self.removeCall(uuid)
            self.requestedEndReasons.removeValue(forKey: uuid)
            self.provider?.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
            self.emit(type: reason.hasPrefix("invite_") ? "remoteEnded" : "ended", call: call, reason: reason)
          }
        }
      }
    }
  }

  public func reportRemoteEnd(callUuid: String, reason: String) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    DispatchQueue.main.async { [weak self] in
      guard let self, let call = self.activeCalls[uuid] else { return }
      self.markTerminalInvite(call.inviteId)
      _ = self.removeCall(uuid)
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

  public func requestAnswer(callUuid: String, inviteId: String) async throws {
    ChillywoodNativeCallDiagnostics.shared.record(.answerRequestReceived, callUuid: UUID(uuidString: callUuid))
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    let normalizedInviteId = inviteId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedInviteId.isEmpty else { throw ChillywoodNativeCallError.invalidPayload }

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      DispatchQueue.main.async { [weak self] in
        guard let self else {
          continuation.resume(throwing: ChillywoodNativeCallError.callUnavailable)
          return
        }
        guard
          let call = self.activeCalls[uuid], call.presentationConfirmed,
          call.inviteId == normalizedInviteId,
          !self.isTerminalInvite(normalizedInviteId)
        else {
          ChillywoodNativeCallDiagnostics.shared.record(.answerRequestRejected, callUuid: uuid,
            error: ChillywoodNativeCallError.callUnavailable)
          continuation.resume(throwing: ChillywoodNativeCallError.callUnavailable)
          return
        }
        if call.answered || self.pendingAnswerActions[uuid] != nil {
          continuation.resume()
          return
        }
        if call.ringingDeadline?.wakeup(
          now: Date(), ownsCall: true, answered: false, answerPending: false
        ) == .expire {
          ChillywoodNativeCallDiagnostics.shared.record(.answerRequestRejected, callUuid: uuid,
            error: ChillywoodNativeCallError.callUnavailable)
          self.timeoutCall(uuid, generation: call.generation)
          continuation.resume(throwing: ChillywoodNativeCallError.callUnavailable)
          return
        }

        self.requestedAnswerCompletions[uuid, default: []].append { result in
          continuation.resume(with: result)
        }
        if self.requestedAnswerTransactions.contains(uuid) { return }

        self.requestedAnswerTransactions.insert(uuid)
        let transaction = CXTransaction(action: CXAnswerCallAction(call: uuid))
        self.callController.request(transaction) { [weak self] error in
          DispatchQueue.main.async {
            if let error {
              ChillywoodNativeCallDiagnostics.shared.record(.answerRequestRejected, callUuid: uuid, error: error)
              self?.requestedAnswerTransactions.remove(uuid)
              self?.settleRequestedAnswers(uuid, result: .failure(error))
              return
            }
            ChillywoodNativeCallDiagnostics.shared.record(.answerRequestQueued, callUuid: uuid)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
              guard
                let self,
                self.requestedAnswerTransactions.remove(uuid) != nil
              else { return }
              ChillywoodNativeCallDiagnostics.shared.record(.answerRequestTimedOut, callUuid: uuid,
                error: ChillywoodNativeCallError.answerNotPending)
              self.settleRequestedAnswers(
                uuid,
                result: .failure(ChillywoodNativeCallError.answerNotPending)
              )
            }
          }
        }
      }
    }
  }

  public func completeTerminalTransition(callUuid: String) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    DispatchQueue.main.async { [weak self] in
      self?.endTerminalTransitionBackgroundTask(uuid)
    }
  }

  public func setMuted(callUuid: String, muted: Bool) throws {
    guard let uuid = UUID(uuidString: callUuid) else { throw ChillywoodNativeCallError.invalidCallUuid }
    let transaction = CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))
    callController.request(transaction) { _ in }
  }

  public func setAudioRoute(_ route: String) throws {
    let session = AVAudioSession.sharedInstance()
    do {
      switch route {
      case "speaker":
        audioSessionDiagnostics.record(.audioRouteSpeakerRequested)
        try session.overrideOutputAudioPort(.speaker)
      case "receiver":
        audioSessionDiagnostics.record(.audioRouteReceiverRequested)
        try session.overrideOutputAudioPort(.none)
      case "system":
        audioSessionDiagnostics.record(.audioRouteSystemRequested)
        try session.overrideOutputAudioPort(.none)
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
      default:
        throw ChillywoodNativeCallError.unsupportedAudioRoute
      }
      audioSessionDiagnostics.record(.audioRouteSucceeded)
      // This is one immediate session-wide sample, not a settled route or
      // audible-media receipt. No port name, raw type, UID or call identity is logged.
      let outputs = session.currentRoute.outputs
      if outputs.isEmpty {
        audioSessionDiagnostics.record(.audioRouteImmediateNoOutputs)
      } else if outputs.count == 1 && outputs[0].portType == .builtInSpeaker {
        audioSessionDiagnostics.record(.audioRouteImmediateSpeaker)
      } else if outputs.count == 1 && outputs[0].portType == .builtInReceiver {
        audioSessionDiagnostics.record(.audioRouteImmediateReceiver)
      } else {
        audioSessionDiagnostics.record(.audioRouteImmediateOther)
      }
    } catch {
      audioSessionDiagnostics.record(.audioRouteFailed, error: error)
      throw error
    }
  }

  public func applicationDidBecomeActive() {
    guard isBuildEnabled else { return }
    emitRaw(["type": "applicationActive"])
  }

  public func applicationWillTerminate() {
    activeCalls.values.forEach { $0.timeoutWorkItem?.cancel() }
    endAllAnswerTransitionBackgroundTasks()
    endAllTerminalTransitionBackgroundTasks()
    deactivateAudioSession()
  }

  private func beginAnswerTransitionBackgroundTask(_ uuid: UUID) {
    dispatchPrecondition(condition: .onQueue(.main))
    endAnswerTransitionBackgroundTask(uuid)

    var taskIdentifier = UIBackgroundTaskIdentifier.invalid
    taskIdentifier = UIApplication.shared.beginBackgroundTask(
      withName: "ChillywoodCallAnswerTransition"
    ) { [weak self] in
      DispatchQueue.main.async {
        self?.endAnswerTransitionBackgroundTask(uuid)
      }
    }
    guard taskIdentifier != .invalid else { return }

    answerTransitionBackgroundTasks[uuid] = taskIdentifier
    let timeout = DispatchWorkItem { [weak self] in
      self?.endAnswerTransitionBackgroundTask(uuid)
    }
    answerTransitionBackgroundTaskTimeouts[uuid] = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
  }

  private func endAnswerTransitionBackgroundTask(_ uuid: UUID) {
    dispatchPrecondition(condition: .onQueue(.main))
    answerTransitionBackgroundTaskTimeouts.removeValue(forKey: uuid)?.cancel()
    guard let taskIdentifier = answerTransitionBackgroundTasks.removeValue(forKey: uuid) else { return }
    UIApplication.shared.endBackgroundTask(taskIdentifier)
  }

  private func endAllAnswerTransitionBackgroundTasks() {
    dispatchPrecondition(condition: .onQueue(.main))
    let callUuids = Array(answerTransitionBackgroundTasks.keys)
    callUuids.forEach { endAnswerTransitionBackgroundTask($0) }
  }

  private func beginTerminalTransitionBackgroundTask(_ uuid: UUID) {
    dispatchPrecondition(condition: .onQueue(.main))
    endTerminalTransitionBackgroundTask(uuid)

    var taskIdentifier = UIBackgroundTaskIdentifier.invalid
    taskIdentifier = UIApplication.shared.beginBackgroundTask(
      withName: "ChillywoodCallTerminalTransition"
    ) { [weak self] in
      DispatchQueue.main.async {
        self?.endTerminalTransitionBackgroundTask(uuid)
      }
    }
    guard taskIdentifier != .invalid else { return }

    terminalTransitionBackgroundTasks[uuid] = taskIdentifier
    let timeout = DispatchWorkItem { [weak self] in
      self?.endTerminalTransitionBackgroundTask(uuid)
    }
    terminalTransitionBackgroundTaskTimeouts[uuid] = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
  }

  private func endTerminalTransitionBackgroundTask(_ uuid: UUID) {
    dispatchPrecondition(condition: .onQueue(.main))
    terminalTransitionBackgroundTaskTimeouts.removeValue(forKey: uuid)?.cancel()
    guard let taskIdentifier = terminalTransitionBackgroundTasks.removeValue(forKey: uuid) else { return }
    UIApplication.shared.endBackgroundTask(taskIdentifier)
  }

  private func endAllTerminalTransitionBackgroundTasks() {
    dispatchPrecondition(condition: .onQueue(.main))
    let callUuids = Array(terminalTransitionBackgroundTasks.keys)
    callUuids.forEach { endTerminalTransitionBackgroundTask($0) }
  }

  public func drainPendingEvents() -> [[String: Any]] {
    let drain = { [self] in
      let events = stateQueue.sync {
      let persistedEvents = UserDefaults.standard.array(forKey: pendingEventsDefaultsKey) as? [[String: Any]] ?? []
      let durableAnswerEvents = UserDefaults.standard.array(forKey: pendingAnswerEventsDefaultsKey) as? [[String: Any]] ?? []
      // Answer is the only lifecycle event whose native CallKit action remains
      // pending while JavaScript restores authenticated authority and joins
      // media. Keep it replayable until completeAnswerOnMain/failure/terminal
      // cleanup acknowledges that exact UUID. Other lifecycle events remain a
      // bounded one-shot queue.
      let transientEvents = persistedEvents.filter { $0["type"] as? String != "answerRequested" }
      let events = durableAnswerEvents + transientEvents + pendingEvents
      pendingEvents.removeAll()
      UserDefaults.standard.removeObject(forKey: pendingEventsDefaultsKey)
      return events
      }
      // Positive activation is process-memory authority, never a durable event.
      return events.filter { $0["type"] as? String != "audioSessionActivated" }
        .map { recoveredAudioReadiness($0) }
    }
    if Thread.isMainThread { return drain() }
    return DispatchQueue.main.sync(execute: drain)
  }

  private func recoveredAudioReadiness(_ event: [String: Any]) -> [String: Any] {
    dispatchPrecondition(condition: .onQueue(.main))
    guard event["type"] as? String == "recovered" else { return event }
    var current = event
    // Overwrite any persisted field with current native ownership. In
    // particular, a process restart cannot replay historical activation.
    current["audioSessionActive"] = false
    guard let uuidText = event["callUuid"] as? String, let uuid = UUID(uuidString: uuidText),
      let call = activeCalls[uuid], hasCurrentCallKitAudioActivation(call),
      call.generation.uuidString.lowercased() == event["nativeCallGeneration"] as? String,
      call.presentationAuthority?.sessionGeneration == event["nativeSessionGeneration"] as? String,
      call.inviteId == event["callInviteId"] as? String,
      call.threadId == event["threadId"] as? String
    else { return current }
    current["audioSessionActive"] = true
    return current
  }

  private func recordCallKitAudioActivation() {
    dispatchPrecondition(condition: .onQueue(.main))
    callKitAudioSessionActive = true
    callKitAudioActivationOwners.removeAll()
    guard let authority = persistedVoipAuthority() else { return }
    for call in activeCalls.values where call.presentationConfirmed && call.presentationAuthority == authority {
      callKitAudioActivationOwners[call.uuid] = (call.generation, authority)
    }
  }

  private func hasCurrentCallKitAudioActivation(_ call: ActiveNativeCall) -> Bool {
    guard callKitAudioSessionActive, call.answered, call.presentationConfirmed,
      let owner = callKitAudioActivationOwners[call.uuid], owner.generation == call.generation,
      let authority = persistedVoipAuthority(), owner.authority == authority,
      call.presentationAuthority == authority, !isTerminalInvite(call.inviteId)
    else { return false }
    return CXCallObserver().calls.contains { $0.uuid == call.uuid && !$0.hasEnded }
  }

  private func persistPendingAnswerEvent(_ event: [String: Any]) {
    guard
      event["type"] as? String == "answerRequested",
      let callUuid = event["callUuid"] as? String,
      UUID(uuidString: callUuid) != nil,
      let callInviteId = event["callInviteId"] as? String,
      !callInviteId.isEmpty,
      let threadId = event["threadId"] as? String,
      !threadId.isEmpty
    else { return }

    let normalizedUuid = callUuid.lowercased()
    let sanitizedEvent: [String: Any] = [
      "type": "answerRequested",
      "callUuid": normalizedUuid,
      "callInviteId": callInviteId,
      "threadId": threadId,
      "callType": event["callType"] as? String == "video" ? "video" : "voice",
    ]
    stateQueue.sync {
      var persisted = UserDefaults.standard.array(forKey: pendingAnswerEventsDefaultsKey) as? [[String: Any]] ?? []
      persisted.removeAll { ($0["callUuid"] as? String)?.lowercased() == normalizedUuid }
      persisted.append(sanitizedEvent)
      if persisted.count > 8 { persisted.removeFirst(persisted.count - 8) }
      UserDefaults.standard.set(persisted, forKey: pendingAnswerEventsDefaultsKey)
    }
  }

  private func clearPendingAnswerEvent(_ uuid: UUID) {
    let normalizedUuid = uuid.uuidString.lowercased()
    stateQueue.sync {
      var persisted = UserDefaults.standard.array(forKey: pendingAnswerEventsDefaultsKey) as? [[String: Any]] ?? []
      persisted.removeAll { ($0["callUuid"] as? String)?.lowercased() == normalizedUuid }
      if persisted.isEmpty {
        UserDefaults.standard.removeObject(forKey: pendingAnswerEventsDefaultsKey)
      } else {
        UserDefaults.standard.set(persisted, forKey: pendingAnswerEventsDefaultsKey)
      }
    }
  }

  private func retainPendingAnswerEvents(for callUuids: Set<UUID>) {
    let retainedUuids = Set(callUuids.map { $0.uuidString.lowercased() })
    stateQueue.sync {
      let persisted = UserDefaults.standard.array(forKey: pendingAnswerEventsDefaultsKey) as? [[String: Any]] ?? []
      let retained = persisted.filter {
        guard let callUuid = ($0["callUuid"] as? String)?.lowercased() else { return false }
        return retainedUuids.contains(callUuid)
      }
      if retained.isEmpty {
        UserDefaults.standard.removeObject(forKey: pendingAnswerEventsDefaultsKey)
      } else {
        UserDefaults.standard.set(retained, forKey: pendingAnswerEventsDefaultsKey)
      }
    }
  }

  private func completeAnswerOnMain(_ uuid: UUID, connected: Bool, reason: String) {
    dispatchPrecondition(condition: .onQueue(.main))
    clearPendingAnswerEvent(uuid)
    endAnswerTransitionBackgroundTask(uuid)
    guard let action = pendingAnswerActions.removeValue(forKey: uuid) else { return }
    pendingAnswerTimeouts.removeValue(forKey: uuid)?.cancel()
    guard var call = activeCalls[uuid] else {
      action.fail()
      return
    }

    var answerReady = connected
    var failureReason = reason
    if connected {
      // CallKit activates the session after Answer is fulfilled. Configure the
      // exact pending call first, without activating or beginning capture here.
      audioSessionDiagnostics.record(.answerAudioConfigurationRequested, callUuid: uuid)
      do {
        try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .voiceChat,
          options: [.allowBluetoothHFP, .allowBluetoothA2DP])
        audioSessionDiagnostics.record(.answerAudioConfigurationSucceeded, callUuid: uuid)
      } catch {
        audioSessionDiagnostics.record(.answerAudioConfigurationFailed, callUuid: uuid, error: error)
        answerReady = false
        failureReason = "audio_session_configuration_failed"
      }
    }

    if answerReady {
      call.answered = true
      activeCalls[uuid] = call
      persistActiveCallDescriptors()
      action.fulfill()
      ChillywoodNativeCallDiagnostics.shared.record(.answerFulfilled, callUuid: uuid)
      emit(type: "answered", call: call, reason: reason)
      return
    }

    action.fail()
    ChillywoodNativeCallDiagnostics.shared.record(.answerFailed, callUuid: uuid)
    markTerminalInvite(call.inviteId)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
    _ = removeCall(uuid)
    emit(type: "answerFailed", call: call, reason: failureReason)
  }

  private func failPendingAnswer(_ uuid: UUID) {
    clearPendingAnswerEvent(uuid)
    requestedAnswerTransactions.remove(uuid)
    settleRequestedAnswers(uuid, result: .failure(ChillywoodNativeCallError.callUnavailable))
    endAnswerTransitionBackgroundTask(uuid)
    pendingAnswerTimeouts.removeValue(forKey: uuid)?.cancel()
    pendingAnswerActions.removeValue(forKey: uuid)?.fail()
  }

  private func settleRequestedAnswers(_ uuid: UUID, result: Result<Void, Error>) {
    requestedAnswerCompletions.removeValue(forKey: uuid)?.forEach { $0(result) }
  }

  private func persistActiveCallDescriptors() {
    let descriptors = activeCalls.values.filter { $0.presentationConfirmed }.map { call in
      var descriptor: [String: Any] = [
        "callUuid": call.uuid.uuidString.lowercased(),
        "callInviteId": call.inviteId,
        "threadId": call.threadId,
        "callType": call.callType,
        "answered": call.answered,
      ]
      if let deadline = call.ringingDeadline {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        descriptor["expiresAt"] = formatter.string(from: deadline.expiresAt)
        descriptor["ringingDeadlineUptime"] = deadline.uptimeDeadline
        descriptor["ringingObservedUptime"] = ProcessInfo.processInfo.systemUptime
      }
      return descriptor
    }
    UserDefaults.standard.set(descriptors, forKey: activeCallsDefaultsKey)
  }

  private func restoreActiveCallDescriptors() {
    dispatchPrecondition(condition: .onQueue(.main))
    let systemCallUuids = Set(CXCallObserver().calls.filter { !$0.hasEnded }.map(\.uuid))
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
      let answered = descriptor["answered"] as? Bool == true
      let ringingDeadline = ChillywoodIncomingCallDeadline(
        serverExpiresAt: parseServerDate(descriptor["expiresAt"]),
        now: Date(),
        previousUptimeDeadline: descriptor["ringingDeadlineUptime"] as? TimeInterval,
        previousObservedUptime: descriptor["ringingObservedUptime"] as? TimeInterval
      )
      // Old/corrupt descriptors without a usable deadline must not gain a new
      // ringing window. End locally as invalid, never claim server expiry.
      guard answered || ringingDeadline != nil else {
        provider?.reportCall(with: uuid, endedAt: Date(), reason: .failed)
        markTerminalInvite(inviteId)
        continue
      }
      let restoredCall = ActiveNativeCall(
        uuid: uuid,
        inviteId: inviteId,
        threadId: threadId,
        callType: descriptor["callType"] as? String == "video" ? "video" : "voice",
        ringingDeadline: ringingDeadline,
        answered: answered,
        timeoutWorkItem: nil,
        presentationConfirmed: true,
        presentationAuthority: persistedVoipAuthority()
      )
      activeCalls[uuid] = restoredCall
      timeoutCall(uuid, generation: restoredCall.generation)
    }
    persistActiveCallDescriptors()
    retainPendingAnswerEvents(for: Set(activeCalls.keys))
    activeCalls.values.forEach { emit(type: "recovered", call: $0) }
  }

  private func timeoutCall(_ uuid: UUID, generation: UUID) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard var call = activeCalls[uuid], let deadline = call.ringingDeadline else { return }
    switch deadline.wakeup(
      now: Date(),
      ownsCall: call.generation == generation,
      answered: call.answered,
      answerPending: pendingAnswerActions[uuid] != nil
    ) {
    case .ignore:
      return
    case .wait(let delay):
      call.timeoutWorkItem?.cancel()
      let timeout = DispatchWorkItem { [weak self] in
        self?.timeoutCall(uuid, generation: generation)
      }
      call.timeoutWorkItem = timeout
      activeCalls[uuid] = call
      DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: timeout)
      return
    case .expire:
      break
    }
    ChillywoodNativeCallDiagnostics.shared.record(.ringingTimedOut, callUuid: uuid)
    failPendingAnswer(uuid)
    markTerminalInvite(call.inviteId)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
    _ = removeCall(uuid)
    emit(type: "timeout", call: call, reason: "unanswered")
  }

  @discardableResult
  private func removeCall(_ uuid: UUID, incomingReportError: Error = ChillywoodNativeCallError.callUnavailable) -> ActiveNativeCall? {
    clearPendingAnswerEvent(uuid)
    let removed = activeCalls.removeValue(forKey: uuid)
    callKitAudioActivationOwners.removeValue(forKey: uuid)
    settleIncomingReport(uuid, generation: nil, error: incomingReportError)
    guard let call = removed else { return nil }
    requestedAnswerTransactions.remove(uuid)
    settleRequestedAnswers(uuid, result: .failure(ChillywoodNativeCallError.callUnavailable))
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
      "nativeCallGeneration": call.generation.uuidString.lowercased(),
      "nativeSessionGeneration": call.presentationAuthority?.sessionGeneration ?? "",
    ]
    if let reason { event["reason"] = reason }
    emitRaw(event)
  }

  private func emitRaw(_ event: [String: Any]) {
    let isAudioActivation = event["type"] as? String == "audioSessionActivated"
    let isPresentation = ["incoming", "recovered", "audioSessionActivated"].contains(event["type"] as? String ?? "")
    let presentationUuid = (event["callUuid"] as? String).flatMap(UUID.init(uuidString:))
    let presentationGeneration = isPresentation ? presentationUuid.flatMap { activeCalls[$0]?.generation } : nil
    let presentationAuthority = isPresentation ? persistedVoipAuthority() : nil
    let isTokenEvent = ["voipTokenUpdated", "voipTokenInvalidated"].contains(event["type"] as? String ?? "")
    let tokenAuthority = isTokenEvent ? persistedVoipAuthority() : nil
    let tokenRegistry = isTokenEvent ? pushRegistry : nil
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      if isTokenEvent {
        guard let tokenAuthority, let tokenRegistry,
          self.persistedVoipAuthority() == tokenAuthority, self.pushRegistry === tokenRegistry
        else { return }
      }
      if isPresentation {
        guard let presentationUuid, let presentationGeneration,
          let call = self.activeCalls[presentationUuid], call.presentationConfirmed,
          call.generation == presentationGeneration,
          call.presentationAuthority == presentationAuthority,
          self.persistedVoipAuthority() == presentationAuthority,
          !self.isTerminalInvite(call.inviteId)
        else { return }
        if isAudioActivation && !self.hasCurrentCallKitAudioActivation(call) { return }
      }
      if event["type"] as? String == "answerRequested" {
        // Persist before touching the Expo event sink. A suspended app may
        // retain an in-memory sink even though JavaScript cannot consume the
        // event yet. Exact-UUID replay remains available until media success
        // or a terminal path explicitly clears it.
        self.persistPendingAnswerEvent(event)
      }
      if let eventSink = self.eventSink {
        eventSink(self.recoveredAudioReadiness(event))
      } else {
        // A reattached listener receives current readiness through an exact
        // recovered presentation, never a queued historical activation.
        if isAudioActivation { return }
        self.stateQueue.sync {
          // PushKit tokens remain memory-only. Bounded non-token lifecycle
          // events are persisted so a VoIP-launched process can hand CallKit
          // state to React Native after a cold start without persisting any
          // credential value.
          if event["token"] != nil {
            self.pendingEvents.append(event)
            if self.pendingEvents.count > 32 { self.pendingEvents.removeFirst() }
          } else if event["type"] as? String != "answerRequested" {
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
      ringingDeadline: nil,
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
    guard type == .voIP, registry === pushRegistry, persistedVoipAuthority() != nil else { return }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    emitRaw(["type": "voipTokenUpdated", "token": token])
  }

  public func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP, registry === pushRegistry else { return }
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
    let diagnosticCallUuid = (payload.dictionaryPayload["callUuid"] as? String).flatMap(UUID.init(uuidString:))
    ChillywoodNativeCallDiagnostics.shared.record(.pushReceived, callUuid: diagnosticCallUuid)
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
        ChillywoodNativeCallDiagnostics.shared.record(.pushAuthorityRejected, callUuid: diagnosticCallUuid)
        reportInvalidVoipPushOnMain(completion: completion)
        return
      }
      let action = callActionLabel(normalizedPayload)
      if action == "incoming" {
        _ = try reportIncomingCallOnMain(payload: normalizedPayload, requiresPushReport: true) { [weak self] error in
          if error == nil, let self,
            self.voipPayloadMatchesPersistedAuthority(normalizedPayload),
            let call = self.findActiveCall(input: normalizedPayload), call.presentationConfirmed,
            call.inviteId == self.toText(normalizedPayload["callInviteId"]),
            call.threadId == self.toText(normalizedPayload["threadId"]),
            call.presentationAuthority == self.persistedVoipAuthority(),
            !self.isTerminalInvite(call.inviteId)
          {
            self.acknowledgeIncomingCallPresentation(payload: normalizedPayload, callUuid: call.uuid, inviteId: call.inviteId)
          }
          completion()
        }
        return
      }
      handleTerminalVoipAction(
        input: normalizedPayload,
        action: action,
        completion: { [weak self] in
          // The current server only sends incoming VoIP pushes. A legacy
          // terminal payload still carries the old delegate's mandatory
          // report obligation, even when its original call is already gone.
          guard let self else { completion(); return }
          self.reportInvalidVoipPushOnMain(completion: completion)
        }
      )
    } catch {
      ChillywoodNativeCallDiagnostics.shared.record(.pushPayloadRejected, callUuid: diagnosticCallUuid, error: error)
      reportInvalidVoipPushOnMain(completion: completion)
    }
  }

  // MARK: - CallKit

  public func providerDidReset(_ provider: CXProvider) {
    let calls = activeCalls.values
    activeCalls.removeAll()
    drainIncomingReports()
    requestedAnswerTransactions.removeAll()
    requestedAnswerCompletions.values.flatMap { $0 }.forEach {
      $0(.failure(ChillywoodNativeCallError.callUnavailable))
    }
    requestedAnswerCompletions.removeAll()
    calls.forEach {
      $0.timeoutWorkItem?.cancel()
      failPendingAnswer($0.uuid)
      markTerminalInvite($0.inviteId)
      emit(type: "providerReset", call: $0)
    }
    persistActiveCallDescriptors()
    stateQueue.sync {
      UserDefaults.standard.removeObject(forKey: pendingAnswerEventsDefaultsKey)
    }
    endAllAnswerTransitionBackgroundTasks()
    endAllTerminalTransitionBackgroundTasks()
    deactivateAudioSession()
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    ChillywoodNativeCallDiagnostics.shared.record(.answerDelegateReceived, callUuid: action.callUUID)
    requestedAnswerTransactions.remove(action.callUUID)
    guard let call = activeCalls[action.callUUID] else {
      ChillywoodNativeCallDiagnostics.shared.record(.answerDelegateRejected, callUuid: action.callUUID,
        error: ChillywoodNativeCallError.callUnavailable)
      settleRequestedAnswers(action.callUUID, result: .failure(ChillywoodNativeCallError.callUnavailable))
      action.fail()
      return
    }
    if call.ringingDeadline?.wakeup(
      now: Date(), ownsCall: true, answered: call.answered,
      answerPending: pendingAnswerActions[action.callUUID] != nil
    ) == .expire {
      ChillywoodNativeCallDiagnostics.shared.record(.answerDelegateRejected, callUuid: action.callUUID,
        error: ChillywoodNativeCallError.callUnavailable)
      timeoutCall(action.callUUID, generation: call.generation)
      action.fail()
      return
    }
    call.timeoutWorkItem?.cancel()
    // PushKit may have launched the terminated app in the background. Keep the
    // exact CallKit Answer process alive only long enough for React/session
    // hydration, server acceptance, and LiveKit connection to acknowledge the
    // pending action. Every terminal or failed path below releases this lease.
    beginAnswerTransitionBackgroundTask(action.callUUID)
    pendingAnswerActions[action.callUUID] = action
    let timeout = DispatchWorkItem { [weak self] in
      ChillywoodNativeCallDiagnostics.shared.record(.answerActionTimedOut, callUuid: action.callUUID)
      self?.completeAnswerOnMain(action.callUUID, connected: false, reason: "media_connection_timeout")
    }
    pendingAnswerTimeouts[action.callUUID]?.cancel()
    pendingAnswerTimeouts[action.callUUID] = timeout
    let timeoutDelay = max(0.5, action.timeoutDate.timeIntervalSinceNow - 0.25)
    DispatchQueue.main.asyncAfter(deadline: .now() + timeoutDelay, execute: timeout)
    ChillywoodNativeCallDiagnostics.shared.record(.answerPending, callUuid: action.callUUID)
    emit(type: "answerRequested", call: call)
    // A foreground React Answer request is authoritative only after CallKit
    // has installed this exact pending action and emitted the exact-bound
    // native event. Transaction queue acceptance alone is not handoff proof.
    settleRequestedAnswers(action.callUUID, result: .success(()))
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    ChillywoodNativeCallDiagnostics.shared.record(.endDelegateReceived, callUuid: action.callUUID)
    if let call = activeCalls[action.callUUID] { markTerminalInvite(call.inviteId) }
    guard let call = removeCall(action.callUUID) else {
      action.fulfill()
      return
    }
    failPendingAnswer(action.callUUID)
    markTerminalInvite(call.inviteId)
    let requestedReason = requestedEndReasons.removeValue(forKey: action.callUUID)
    if requestedReason == nil {
      // CallKit may wake a suspended process for only a fraction of a second.
      // Keep the app alive just long enough for the authenticated JavaScript
      // bridge to persist the exact server-authoritative Decline/End transition.
      beginTerminalTransitionBackgroundTask(action.callUUID)
    }
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
    callKitAudioSessionActive = false
    callKitAudioActivationOwners.removeAll()
    audioSessionDiagnostics.record(.audioActivationReceived)
    do {
      try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .allowBluetoothA2DP])
      try audioSession.setActive(true)
      recordCallKitAudioActivation()
      audioSessionDiagnostics.record(.audioActivationSucceeded)
      for uuid in callKitAudioActivationOwners.keys {
        if let call = activeCalls[uuid] { emit(type: "audioSessionActivated", call: call) }
      }
    } catch {
      audioSessionDiagnostics.record(.audioActivationFailed, error: error)
      if activeCalls.isEmpty {
        emitRaw(["type": "audioSessionFailed"])
      } else {
        activeCalls.values.forEach { emit(type: "audioSessionFailed", call: $0) }
      }
    }
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    audioSessionDiagnostics.record(.audioDeactivationReceived)
    deactivateAudioSession()
    emitRaw(["type": "audioSessionDeactivated"])
  }

  private func deactivateAudioSession() {
    callKitAudioSessionActive = false
    callKitAudioActivationOwners.removeAll()
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }

  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard
      let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let interruptionType = AVAudioSession.InterruptionType(rawValue: rawType)
    else {
      return
    }

    if interruptionType == .began {
      callKitAudioSessionActive = false
      callKitAudioActivationOwners.removeAll()
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
