import Foundation

var assertions = 0
func check(_ value: @autoclosure () -> Bool, _ message: String) {
  assertions += 1
  if !value() { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
let now = Date(timeIntervalSince1970: 1000)
let callID = UUID(uuidString: "10000000-0000-4000-8000-000000000001")!
let generation = UUID(uuidString: "10000000-0000-4000-8000-000000000002")!
let observer = UUID(uuidString: "10000000-0000-4000-8000-000000000003")!
let connection = UUID(uuidString: "10000000-0000-4000-8000-000000000004")!
func owner(_ change: String? = nil) -> ChillywoodIncomingCallStateOwner {
  ChillywoodIncomingCallStateOwner(
    callUUID: change == "uuid" ? UUID() : callID, inviteID: change == "invite" ? "other" : "invite",
    threadID: change == "thread" ? "other" : "thread", nativeGeneration: change == "generation" ? UUID() : generation,
    userID: change == "user" ? "other" : "user", accountID: change == "account" ? "other" : "user",
    sessionGeneration: change == "session" ? "other" : "session", installID: change == "install" ? "other" : "install")
}
func policy() -> ChillywoodIncomingCallStatePolicy {
  ChillywoodIncomingCallStatePolicy(observerID: observer, connectionID: connection, owner: owner(),
    deadline: ChillywoodIncomingCallDeadline(serverExpiresAt: now.addingTimeInterval(90), now: now, uptime: 10)!)
}
func frame(_ status: String, sequence: Any = 1, changes: [String: Any] = [:]) -> Data {
  var data: [String: Any] = ["observerId": observer.uuidString, "connectionId": connection.uuidString,
    "nativeGeneration": generation.uuidString, "sequence": sequence, "status": status]
  for (key, value) in changes { data[key] = value }
  return try! JSONSerialization.data(withJSONObject: data)
}
func receive(_ p: inout ChillywoodIncomingCallStatePolicy, _ data: Data,
  current: ChillywoodIncomingCallStateOwner? = owner(), answered: Bool = false,
  pending: Bool = false, requested: Bool = false, wall: Date = now, uptime: TimeInterval = 10
) -> ChillywoodIncomingCallStatePolicy.Decision {
  p.receive(data, now: wall, uptime: uptime, currentOwner: current, answered: answered,
    answerPending: pending, answerRequested: requested)
}
for status in ["canceled", "declined", "missed", "ended", "accepted"] {
  var p = policy()
  check(receive(&p, frame(status)) == .terminal(status), "exact current unaccepted call receives terminal")
  check(receive(&p, frame(status, sequence: 2)) == .retire, "terminal callback cannot be applied twice")
  for boundary in ["answered", "pending", "requested"] {
    var q = policy()
    check(receive(&q, frame(status), answered: boundary == "answered", pending: boundary == "pending",
      requested: boundary == "requested") == .retire, "local Answer wins over any older server status")
  }
}
for field in ["uuid", "invite", "thread", "generation", "user", "account", "session", "install"] {
  var p = policy()
  check(receive(&p, frame("canceled"), current: owner(field)) == .retire, "replacement owner \(field) cannot be ended")
}
do { var p=policy(); check(receive(&p, frame("canceled"), current: nil) == .retire, "removed call is not actionable") }
do { var p=policy(); check(receive(&p, frame("canceled"), wall: now.addingTimeInterval(90)) == .retire, "original wall deadline") }
do { var p=policy(); check(receive(&p, frame("canceled"), wall: now.addingTimeInterval(-100), uptime: 100) == .retire, "wall rollback cannot renew monotonic deadline") }
for changes in [["observerId": UUID().uuidString], ["connectionId": UUID().uuidString], ["nativeGeneration": UUID().uuidString], ["accountId": "private"]] {
  var p=policy(); check(receive(&p, frame("canceled", changes: changes)) == .retire, "foreign or expanded frame is rejected")
}
for sequence: Any in [0, -1, 1.5, true, "1", 1001] {
  var p=policy(); check(receive(&p, frame("canceled", sequence: sequence)) == .retire, "invalid sequence")
}
do {
  var p=policy(); check(receive(&p, frame("ringing")) == .waiting, "ringing does not end a call")
  check(receive(&p, frame("canceled", sequence: 1)) == .retire, "replayed sequence cannot end call")
}
do {
  var p=policy(); check(receive(&p, frame("ringing")) == .waiting, "initial read")
  check(receive(&p, frame("canceled", sequence: 2)) == .terminal("canceled"), "later exact canceled state")
}
do { var p=policy(); check(receive(&p, frame("private-server-error")) == .retire, "unknown statuses are not actions") }
do { var p=policy(); check(receive(&p, Data(repeating: 65, count: 2049)) == .retire, "bounded frame size") }
print("PASS \(assertions) native state policy assertions; Foundation-only, no device/runtime claim")
