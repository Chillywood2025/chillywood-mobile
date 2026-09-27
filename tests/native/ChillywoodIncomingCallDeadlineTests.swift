import Foundation

// The runner inserts the actual production declarations and timeout callback;
// only CallKit reporting and persistence are substituted. No timer logic is
// copied into this harness.
// INSERT_ACTIVE_CALL_DECLARATION

private enum EndReason { case unanswered, failed }
private final class ProviderProbe {
  var ended: [UUID] = []
  func reportCall(with uuid: UUID, endedAt: Date, reason: EndReason) { ended.append(uuid) }
}

private final class UserDefaults {
  static let standard = UserDefaults()
  var storage: [String: Any] = [:]
  func array(forKey key: String) -> [Any]? { storage[key] as? [Any] }
  func set(_ value: Any?, forKey key: String) { storage[key] = value }
}

private final class CXCallObserver {
  struct Call { let uuid: UUID }
  static var observedCalls: [Call] = []
  var calls: [Call] { Self.observedCalls }
}

private final class CoordinatorProbe {
  var activeCalls: [UUID: ActiveNativeCall] = [:]
  var pendingAnswerActions: [UUID: Bool] = [:]
  var provider: ProviderProbe? = ProviderProbe()
  var terminalInvites: [String] = []
  var events: [String] = []
  var retainedAnswerUuids: Set<UUID> = []
  let activeCallsDefaultsKey = "test-active-calls"

  func failPendingAnswer(_ uuid: UUID) { pendingAnswerActions.removeValue(forKey: uuid) }
  func markTerminalInvite(_ inviteId: String) { terminalInvites.append(inviteId) }
  func removeCall(_ uuid: UUID) -> ActiveNativeCall? {
    let removed = activeCalls.removeValue(forKey: uuid)
    removed?.timeoutWorkItem?.cancel()
    return removed
  }
  func emit(type: String, call: ActiveNativeCall, reason: String? = nil) { events.append(type) }
  func retainPendingAnswerEvents(for uuids: Set<UUID>) { retainedAnswerUuids = uuids }

  func fire(_ call: ActiveNativeCall) { timeoutCall(call.uuid, generation: call.generation) }
  func save() { persistActiveCallDescriptors() }
  func restore() { restoreActiveCallDescriptors() }
  // INSERT_DATE_PARSER
  // INSERT_PERSIST_CALLBACK
  // INSERT_RESTORE_CALLBACK
  // INSERT_TIMEOUT_CALLBACK
}

private var passed = 0
private func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(name)\n".utf8))
    exit(1)
  }
  passed += 1
}

let now = Date(timeIntervalSince1970: 1_800_000_000)
let uptime: TimeInterval = 50_000
let serverExpiry = now.addingTimeInterval(90)
let deadline = ChillywoodIncomingCallDeadline(serverExpiresAt: serverExpiry, now: now, uptime: uptime)!
func wake(_ time: Date, elapsed: TimeInterval? = nil, owns: Bool = true, answered: Bool = false, pending: Bool = false)
  -> ChillywoodIncomingCallDeadline.Wakeup {
  deadline.wakeup(now: time, uptime: uptime + (elapsed ?? time.timeIntervalSince(now)),
    ownsCall: owns, answered: answered, answerPending: pending)
}
expect(wake(now) == .wait(90), "the server's 90-second invite must not expire at 45")
expect(wake(now.addingTimeInterval(45)) == .wait(45), "early native wakeup rearms until server deadline")
expect(wake(now.addingTimeInterval(89)) == .wait(1), "last ringing second remains available")
expect(wake(serverExpiry) == .expire, "expiry occurs at authoritative deadline")
expect(wake(serverExpiry.addingTimeInterval(20)) == .expire, "late wakeup expires immediately")
expect(wake(serverExpiry, owns: false) == .ignore, "retired timer cannot end replacement call")
expect(wake(serverExpiry, answered: true) == .ignore, "answered calls outlive ringing expiry")
expect(wake(serverExpiry, pending: true) == .ignore, "pending Answer owns its separate completion deadline")
expect(wake(now.addingTimeInterval(-600), elapsed: 20) == .wait(70),
  "backward wall-clock change cannot extend the original monotonic deadline")
expect(wake(now.addingTimeInterval(-600), elapsed: 90) == .expire,
  "original monotonic deadline still expires after wall-clock rollback")
expect(wake(now.addingTimeInterval(120), elapsed: 20) == .expire,
  "forward clock adjustment cannot restart an elapsed absolute deadline")

let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
let serialized = formatter.string(from: serverExpiry)
let restored = ChillywoodIncomingCallDeadline(
  serverExpiresAt: formatter.date(from: serialized), now: now.addingTimeInterval(60), uptime: uptime + 60
)!
expect(restored.expiresAt == serverExpiry, "restore preserves original absolute deadline")
expect(restored.wakeup(now: now.addingTimeInterval(60), uptime: uptime + 60, ownsCall: true, answered: false, answerPending: false)
  == .wait(30), "restore does not start a fresh 90 or 45 second window")
let restoredAfterClockRollback = ChillywoodIncomingCallDeadline(
  serverExpiresAt: serverExpiry, now: now.addingTimeInterval(-20), uptime: uptime + 20,
  previousUptimeDeadline: deadline.uptimeDeadline, previousObservedUptime: uptime
)!
expect(restoredAfterClockRollback.uptimeDeadline == deadline.uptimeDeadline
  && restoredAfterClockRollback.wakeup(now: now.addingTimeInterval(-20), uptime: uptime + 20,
    ownsCall: true, answered: false, answerPending: false) == .wait(70),
  "process restart after wall-clock rollback retains the prior monotonic ceiling")
let restoredAfterUptimeReset = ChillywoodIncomingCallDeadline(
  serverExpiresAt: serverExpiry, now: now.addingTimeInterval(30), uptime: 10,
  previousUptimeDeadline: deadline.uptimeDeadline, previousObservedUptime: uptime
)!
expect(restoredAfterUptimeReset.expiresAt == serverExpiry
  && restoredAfterUptimeReset.wakeup(now: now.addingTimeInterval(30), uptime: 10,
    ownsCall: true, answered: false, answerPending: false) == .wait(60),
  "uptime reset retains original absolute expiry instead of a fresh ringing window")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: serverExpiry, now: now, uptime: uptime,
  previousUptimeDeadline: 42, previousObservedUptime: nil) == nil,
  "partial persisted monotonic metadata is rejected")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: serverExpiry, now: now, uptime: .infinity) == nil,
  "invalid current uptime is rejected")
let expiredRestore = ChillywoodIncomingCallDeadline(serverExpiresAt: serverExpiry, now: serverExpiry.addingTimeInterval(1))!
expect(expiredRestore.wakeup(now: serverExpiry.addingTimeInterval(1), ownsCall: true, answered: false, answerPending: false)
  == .expire, "expired persisted call cannot regain ringing lifetime")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: nil, now: now) == nil, "missing deadline is invalid")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: Date(timeIntervalSince1970: .nan), now: now) == nil,
  "NaN deadline is invalid")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: Date(timeIntervalSince1970: .infinity), now: now) == nil,
  "infinite deadline is invalid")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: now.addingTimeInterval(301), now: now) == nil,
  "unreasonably distant payload is rejected, not shortened")
expect(ChillywoodIncomingCallDeadline(serverExpiresAt: now.addingTimeInterval(300), now: now) != nil,
  "sanity bound does not reject its exact boundary")

private func makeCall(uuid: UUID = UUID(), expiry: Date, answered: Bool = false) -> ActiveNativeCall {
  ActiveNativeCall(
    uuid: uuid, inviteId: UUID().uuidString, threadId: UUID().uuidString, callType: "voice",
    ringingDeadline: ChillywoodIncomingCallDeadline(serverExpiresAt: expiry, now: Date()),
    answered: answered, timeoutWorkItem: nil
  )
}
private let future = makeCall(expiry: Date().addingTimeInterval(90))
private let coordinator = CoordinatorProbe()
coordinator.activeCalls[future.uuid] = future
coordinator.fire(future)
expect(coordinator.events.isEmpty && coordinator.activeCalls[future.uuid]?.timeoutWorkItem != nil,
  "actual callback schedules future invite without reporting timeout")
coordinator.fire(future)
expect(coordinator.events.isEmpty, "repeated early callback still cannot expire call")
coordinator.activeCalls[future.uuid]?.timeoutWorkItem?.cancel()

private let expired = makeCall(expiry: Date().addingTimeInterval(-1))
private let sameUuidReplacement = makeCall(uuid: expired.uuid, expiry: Date().addingTimeInterval(-1))
coordinator.activeCalls[expired.uuid] = sameUuidReplacement
coordinator.fire(expired)
expect(coordinator.activeCalls[expired.uuid]?.generation == sameUuidReplacement.generation
  && coordinator.events.isEmpty, "actual retired callback cannot end same-UUID replacement")
coordinator.pendingAnswerActions[expired.uuid] = true
coordinator.fire(sameUuidReplacement)
expect(coordinator.events.isEmpty && coordinator.pendingAnswerActions[expired.uuid] != nil,
  "actual callback cannot cancel pending Answer")
coordinator.pendingAnswerActions.removeValue(forKey: expired.uuid)
private var answered = sameUuidReplacement
answered.answered = true
coordinator.activeCalls[answered.uuid] = answered
coordinator.fire(answered)
expect(coordinator.events.isEmpty && coordinator.activeCalls[answered.uuid] != nil,
  "actual callback cannot end answered call")
coordinator.activeCalls[sameUuidReplacement.uuid] = sameUuidReplacement
coordinator.fire(sameUuidReplacement)
expect(coordinator.events == ["timeout"] && coordinator.activeCalls[expired.uuid] == nil
  && coordinator.terminalInvites == [sameUuidReplacement.inviteId]
  && coordinator.provider?.ended == [sameUuidReplacement.uuid],
  "actual expired-owner callback ends and emits exactly once")
coordinator.fire(sameUuidReplacement)
expect(coordinator.events == ["timeout"], "duplicate expired callback is idempotent")

// Exercise the actual persistence and restore methods, with only UserDefaults
// and the system call inventory substituted. Each restart retains the same
// absolute deadline and can only recover a call still known to CallKit.
private let storageCoordinator = CoordinatorProbe()
private let persistedCall = makeCall(expiry: Date().addingTimeInterval(70))
storageCoordinator.activeCalls[persistedCall.uuid] = persistedCall
storageCoordinator.save()
private let storedDescriptor = (UserDefaults.standard.storage["test-active-calls"] as! [[String: Any]]).first!
expect(storedDescriptor["ringingDeadlineUptime"] as? TimeInterval == persistedCall.ringingDeadline?.uptimeDeadline
  && (storedDescriptor["ringingObservedUptime"] as? TimeInterval)?.isFinite == true,
  "actual persistence stores monotonic ceiling and observed uptime")
CXCallObserver.observedCalls = [.init(uuid: persistedCall.uuid)]
private let restoredCoordinator = CoordinatorProbe()
restoredCoordinator.restore()
private let restoredCall = restoredCoordinator.activeCalls[persistedCall.uuid]!
expect(abs(restoredCall.ringingDeadline!.expiresAt.timeIntervalSince(persistedCall.ringingDeadline!.expiresAt)) < 0.001,
  "actual persistence/restore preserves deadline to supported timestamp precision")
expect(restoredCall.ringingDeadline!.expiresAt.timeIntervalSinceNow > 60,
  "actual restored invite retains over 45 seconds when authorized")
expect(restoredCall.timeoutWorkItem != nil && restoredCoordinator.events == ["recovered"],
  "actual restore schedules ringing and reports recovery")
expect(restoredCoordinator.retainedAnswerUuids == [persistedCall.uuid],
  "actual restore retains only the recovered exact pending Answer")
restoredCall.timeoutWorkItem?.cancel()

private var elapsedDescriptor = storedDescriptor
elapsedDescriptor["ringingDeadlineUptime"] = ProcessInfo.processInfo.systemUptime - 1
elapsedDescriptor["ringingObservedUptime"] = ProcessInfo.processInfo.systemUptime - 2
UserDefaults.standard.storage["test-active-calls"] = [elapsedDescriptor]
private let elapsedRestore = CoordinatorProbe()
elapsedRestore.restore()
expect(elapsedRestore.activeCalls.isEmpty && elapsedRestore.events == ["timeout"]
  && elapsedRestore.provider?.ended == [persistedCall.uuid],
  "actual restore consumes elapsed monotonic deadline despite future wall expiry")

private let answeredCoordinator = CoordinatorProbe()
private let persistedAnswered = makeCall(expiry: Date().addingTimeInterval(-60), answered: true)
answeredCoordinator.activeCalls[persistedAnswered.uuid] = persistedAnswered
answeredCoordinator.save()
CXCallObserver.observedCalls = [.init(uuid: persistedAnswered.uuid)]
private let answeredRestore = CoordinatorProbe()
answeredRestore.restore()
expect(answeredRestore.activeCalls[persistedAnswered.uuid]?.answered == true
  && answeredRestore.activeCalls[persistedAnswered.uuid]?.timeoutWorkItem == nil
  && answeredRestore.provider?.ended.isEmpty == true,
  "actual restore cannot expire an answered call using ringing deadline")

private let corruptUuid = UUID()
private let corruptInvite = UUID().uuidString
UserDefaults.standard.storage["test-active-calls"] = [[
  "callUuid": corruptUuid.uuidString, "callInviteId": corruptInvite,
  "threadId": UUID().uuidString, "answered": false,
]]
CXCallObserver.observedCalls = [.init(uuid: corruptUuid)]
private let corruptRestore = CoordinatorProbe()
corruptRestore.restore()
expect(corruptRestore.activeCalls.isEmpty && corruptRestore.provider?.ended == [corruptUuid]
  && corruptRestore.terminalInvites == [corruptInvite] && corruptRestore.events.isEmpty,
  "actual missing-deadline restore fails locally without inventing server expiry")
expect(corruptRestore.retainedAnswerUuids.isEmpty,
  "invalid restored call cannot replay a persisted Answer")

storageCoordinator.save()
CXCallObserver.observedCalls = []
private let absentRestore = CoordinatorProbe()
absentRestore.restore()
expect(absentRestore.activeCalls.isEmpty && absentRestore.events.isEmpty,
  "persisted descriptor cannot invent a CallKit call absent from system inventory")

print("Native incoming deadline: \(passed) policy and actual-callback assertions passed.")
