import Foundation

// The server supplies the ringing deadline. A native timer may wake early or
// survive cancellation, so its callback must recheck both deadline and owner.
// This policy is Foundation-only so its actual Swift code runs in ordinary CI.
struct ChillywoodIncomingCallDeadline: Equatable {
  enum Wakeup: Equatable {
    case ignore
    case wait(TimeInterval)
    case expire
  }

  // Reject an invalid payload instead of silently shortening a valid invite or
  // inventing a fresh lifetime. This exceeds the server's current 90 seconds
  // and tolerates delivery delay / modest clock skew without unbounded timers.
  static let maximumAcceptedFutureInterval: TimeInterval = 300
  let expiresAt: Date
  let uptimeDeadline: TimeInterval

  init?(
    serverExpiresAt: Date?,
    now: Date,
    uptime: TimeInterval = ProcessInfo.processInfo.systemUptime,
    previousUptimeDeadline: TimeInterval? = nil,
    previousObservedUptime: TimeInterval? = nil
  ) {
    guard let serverExpiresAt else { return nil }
    let remaining = serverExpiresAt.timeIntervalSince(now)
    guard remaining.isFinite, remaining <= Self.maximumAcceptedFutureInterval,
      uptime.isFinite, uptime >= 0 else { return nil }
    let localDeadline = uptime + max(0, remaining)
    guard localDeadline.isFinite else { return nil }
    if previousUptimeDeadline != nil || previousObservedUptime != nil {
      guard let previousUptimeDeadline, let previousObservedUptime,
        previousUptimeDeadline.isFinite, previousUptimeDeadline >= 0,
        previousObservedUptime.isFinite, previousObservedUptime >= 0 else { return nil }
      // Process restarts keep the existing monotonic ceiling. If the device
      // rebooted (uptime reset), only the original server date can bound the
      // restored call; never give it a fresh fixed ringing lifetime.
      self.uptimeDeadline = uptime >= previousObservedUptime
        ? min(previousUptimeDeadline, localDeadline) : localDeadline
    } else {
      self.uptimeDeadline = localDeadline
    }
    self.expiresAt = serverExpiresAt
  }

  func wakeup(
    now: Date,
    uptime: TimeInterval = ProcessInfo.processInfo.systemUptime,
    ownsCall: Bool,
    answered: Bool,
    answerPending: Bool
  ) -> Wakeup {
    guard ownsCall, !answered, !answerPending else { return .ignore }
    let remaining = min(expiresAt.timeIntervalSince(now), uptimeDeadline - uptime)
    guard remaining > 0 else { return .expire }
    // A backward wall-clock change cannot lengthen the original presentation.
    // Server acceptance remains authoritative when device clocks disagree.
    return .wait(min(Self.maximumAcceptedFutureInterval, remaining))
  }
}
