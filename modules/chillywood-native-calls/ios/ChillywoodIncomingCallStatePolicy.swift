import Foundation
import CoreFoundation

// Proposed native policy. It cannot report/end/answer a call or activate audio.
// The coordinator supplies its actual current immutable owner at each callback.
struct ChillywoodIncomingCallStateOwner: Equatable {
  let callUUID: UUID
  let inviteID: String
  let threadID: String
  let nativeGeneration: UUID
  let userID: String
  let accountID: String
  let sessionGeneration: String
  let installID: String
}

struct ChillywoodIncomingCallStatePolicy {
  enum Decision: Equatable {
    case waiting
    case retire
    case terminal(String)
  }
  let observerID: UUID
  let connectionID: UUID
  let owner: ChillywoodIncomingCallStateOwner
  let deadline: ChillywoodIncomingCallDeadline
  private(set) var lastSequence = 0
  private(set) var retired = false

  mutating func receive(
    _ data: Data, now: Date, uptime: TimeInterval,
    currentOwner: ChillywoodIncomingCallStateOwner?, answered: Bool,
    answerPending: Bool, answerRequested: Bool
  ) -> Decision {
    guard !retired else { return .retire }
    guard currentOwner == owner, !answered, !answerPending, !answerRequested,
      case .wait = deadline.wakeup(now: now, uptime: uptime, ownsCall: true,
        answered: false, answerPending: false) else { retired = true; return .retire }
    guard data.count <= 2048,
      let frame = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      Set(frame.keys) == Set(["observerId", "connectionId", "nativeGeneration", "sequence", "status"]),
      let observer = frame["observerId"] as? String, UUID(uuidString: observer) == observerID,
      let connection = frame["connectionId"] as? String, UUID(uuidString: connection) == connectionID,
      let generation = frame["nativeGeneration"] as? String, UUID(uuidString: generation) == owner.nativeGeneration,
      let sequence = frame["sequence"] as? NSNumber, CFGetTypeID(sequence) != CFBooleanGetTypeID(),
      sequence.doubleValue.isFinite, sequence.doubleValue.rounded(.towardZero) == sequence.doubleValue,
      sequence.doubleValue > Double(lastSequence), sequence.doubleValue <= 1000,
      let status = frame["status"] as? String,
      ["ringing", "accepted", "canceled", "declined", "missed", "ended"].contains(status)
    else { retired = true; return .retire }
    lastSequence = sequence.intValue
    if status == "ringing" { return .waiting }
    retired = true
    // Accepted can mean answered elsewhere only while this exact native call has
    // no local pending/requested Answer. Those guards are checked above and the
    // coordinator must recheck them synchronously before reporting a terminal.
    return .terminal(status)
  }
}
