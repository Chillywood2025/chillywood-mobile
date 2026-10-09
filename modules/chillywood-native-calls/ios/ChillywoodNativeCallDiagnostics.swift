import CryptoKit
import Foundation
import os

// This records bounded native receipts only. It does not assert media success
// or change CallKit behavior, and cannot be enabled by JavaScript or an OTA.
enum ChillywoodNativeCallDiagnosticPhase: String, CaseIterable {
  case lifecyclePrepared = "lifecycle_prepared"
  case registrationStartReceived = "registration_start_received"
  case registrationStarted = "registration_started"
  case registrationStopReceived = "registration_stop_received"
  case registrationStopped = "registration_stopped"
  case foregroundReportReceived = "foreground_report_received"
  case foregroundReportRejected = "foreground_report_rejected"
  case pushReceived = "push_received"
  case pushAuthorityRejected = "push_authority_rejected"
  case pushPayloadRejected = "push_payload_rejected"
  case incomingReportRequested = "incoming_report_requested"
  case incomingReportSucceeded = "incoming_report_succeeded"
  case incomingReportFailed = "incoming_report_failed"
  case answerRequestReceived = "answer_request_received"
  case answerRequestRejected = "answer_request_rejected"
  case answerRequestQueued = "answer_request_queued"
  case answerRequestTimedOut = "answer_request_timed_out"
  case answerDelegateReceived = "answer_delegate_received"
  case answerDelegateRejected = "answer_delegate_rejected"
  case answerPending = "answer_pending"
  case answerAudioConfigurationRequested = "answer_audio_configuration_requested"
  case answerAudioConfigurationSucceeded = "answer_audio_configuration_succeeded"
  case answerAudioConfigurationFailed = "answer_audio_configuration_failed"
  case answerFulfilled = "answer_fulfilled"
  case answerFailed = "answer_failed"
  case audioActivationReceived = "audio_activation_received"
  case audioActivationSucceeded = "audio_activation_succeeded"
  case audioActivationFailed = "audio_activation_failed"
  case audioDeactivationReceived = "audio_deactivation_received"
  case audioRouteSpeakerRequested = "audio_route_speaker_requested"
  case audioRouteReceiverRequested = "audio_route_receiver_requested"
  case audioRouteSystemRequested = "audio_route_system_requested"
  case audioRouteSucceeded = "audio_route_succeeded"
  case audioRouteFailed = "audio_route_failed"
  case audioRouteImmediateSpeaker = "audio_route_immediate_speaker"
  case audioRouteImmediateReceiver = "audio_route_immediate_receiver"
  case audioRouteImmediateNoOutputs = "audio_route_immediate_no_outputs"
  case audioRouteImmediateOther = "audio_route_immediate_other"
}

final class ChillywoodNativeCallDiagnostics {
  private static let logger = Logger(subsystem: "com.chillywood.mobile", category: "native-call-diagnostics")
  static let shared = ChillywoodNativeCallDiagnostics(infoDictionary: Bundle.main.infoDictionary ?? [:])

  private let enabled: Bool
  private let emitLine: (String) -> Void
  private static let allowedErrorDomains: Set<String> = [
    "NSCocoaErrorDomain", "NSPOSIXErrorDomain", "NSOSStatusErrorDomain", "NSURLErrorDomain",
    "AVFoundationErrorDomain", "com.apple.coreaudio.avfaudio",
    "com.apple.CallKit.error.incomingcall", "com.apple.CallKit.error.requesttransaction",
  ]

  init(infoDictionary: [String: Any], emitLine: @escaping (String) -> Void = { line in
    ChillywoodNativeCallDiagnostics.logger.notice("\(line, privacy: .public)")
  }) {
    enabled = infoDictionary["ChillywoodNativeCallDiagnosticsEnabled"] as? Bool == true
      && infoDictionary["ChillywoodNativeCallDiagnosticsChannel"] as? String == "ios-internal-v2"
      && infoDictionary["ChillywoodNativeCallsBuildEnabled"] as? Bool == true
      && infoDictionary["ChillywoodNativeCallsRuntimeDefaultEnabled"] as? Bool == true
    self.emitLine = emitLine
  }

  func record(
    _ phase: ChillywoodNativeCallDiagnosticPhase,
    callUuid: UUID? = nil,
    error: Error? = nil,
    uptime: TimeInterval = ProcessInfo.processInfo.systemUptime
  ) {
    guard enabled else { return }
    let callHash = callUuid.map { uuid in
      SHA256.hash(data: Data(uuid.uuidString.lowercased().utf8))
        .prefix(10).map { String(format: "%02x", $0) }.joined()
    } ?? "none"
    let safeUptime = uptime.isFinite && uptime >= 0 && uptime < Double(Int64.max) / 1_000
      ? Int64(uptime * 1_000) : 0
    var line = "CH_NATIVE_CALL phase=\(phase.rawValue) uptime_ms=\(safeUptime) call_hash=\(callHash)"
    if let error {
      let nativeError = error as NSError
      let domain = Self.allowedErrorDomains.contains(nativeError.domain) ? nativeError.domain : "other"
      line += " error_domain=\(domain) error_code=\(nativeError.code)"
    }
    // Neither error descriptions/userInfo nor any payload/identity/token is
    // accepted by this API. Unknown domains cannot inject arbitrary log text.
    emitLine(line)
  }
}
