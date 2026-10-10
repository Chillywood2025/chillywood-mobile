import Foundation

private var passed = 0
private func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
  guard condition() else {
    FileHandle.standardError.write(Data("FAIL: \(label)\n".utf8))
    exit(1)
  }
  passed += 1
}

private let flags: [String: Any] = [
  "ChillywoodNativeCallDiagnosticsEnabled": true,
  "ChillywoodNativeCallDiagnosticsChannel": "ios-internal-v2",
  "ChillywoodNativeCallsBuildEnabled": true,
  "ChillywoodNativeCallsRuntimeDefaultEnabled": true,
]
private let callUuid = UUID(uuidString: "12345678-1234-5678-9ABC-123456789ABC")!
private let otherUuid = UUID(uuidString: "12345678-1234-5678-9ABC-123456789ABD")!
private let expectedHash = "4f9c5d986da99823c4bf"
private var lines: [String] = []
private let diagnostic = ChillywoodNativeCallDiagnostics(infoDictionary: flags) { lines.append($0) }

// Execute the production gate, hashing and serializer, replacing only the
// final OS-log sink so the test can independently inspect every emitted byte.
for key in flags.keys {
  for value in [nil, false, "true", "production-v2"] as [Any?] {
    var disabled = flags
    disabled[key] = value
    var emitted: [String] = []
    ChillywoodNativeCallDiagnostics(infoDictionary: disabled) { emitted.append($0) }
      .record(.answerRequestReceived, callUuid: callUuid, uptime: 1.25)
    expect(emitted.isEmpty, "all compiled internal gate inputs are required with their exact types")
  }
}
var absent: [String] = []
ChillywoodNativeCallDiagnostics(infoDictionary: [:]) { absent.append($0) }.record(.pushReceived)
expect(absent.isEmpty, "a normal release has no diagnostic output")

for phase in ChillywoodNativeCallDiagnosticPhase.allCases {
  diagnostic.record(phase, callUuid: callUuid, uptime: 12.345)
  expect(lines.last == "CH_NATIVE_CALL phase=\(phase.rawValue) uptime_ms=12345 call_hash=\(expectedHash)",
    "every phase retains deterministic monotonic timing and hashed call correlation")
}
diagnostic.record(.answerPending, callUuid: otherUuid, uptime: 13)
expect(!lines.last!.contains(expectedHash), "different calls cannot inherit the same correlation value")
diagnostic.record(.pushReceived, uptime: 14)
expect(lines.last == "CH_NATIVE_CALL phase=push_received uptime_ms=14000 call_hash=none",
  "a missing descriptor does not fabricate call identity")

let privateMarker = "PRIVATE-PAYLOAD-TOKEN-SHOULD-NEVER-APPEAR"
let nativeError = NSError(domain: "com.apple.CallKit.error.requesttransaction", code: 4,
  userInfo: [NSLocalizedDescriptionKey: privateMarker, "payload": privateMarker])
diagnostic.record(.answerRequestRejected, callUuid: callUuid, error: nativeError, uptime: 15)
expect(lines.last!.hasSuffix(" error_domain=com.apple.CallKit.error.requesttransaction error_code=4"),
  "known native domain and numeric code survive without private error contents")
let untrustedDomain = NSError(domain: privateMarker, code: -9,
  userInfo: [NSLocalizedDescriptionKey: privateMarker, NSUnderlyingErrorKey: nativeError])
diagnostic.record(.incomingReportFailed, callUuid: callUuid, error: untrustedDomain, uptime: 16)
expect(lines.last!.hasSuffix(" error_domain=other error_code=-9"), "unknown domains cannot inject arbitrary text")
expect(lines.allSatisfy { !$0.contains(privateMarker) && !$0.lowercased().contains(callUuid.uuidString.lowercased()) },
  "raw UUID, descriptions, userInfo, and arbitrary payload text never enter logs")
for invalidTime in [Double.nan, Double.infinity, -1, Double(Int64.max)] {
  diagnostic.record(.audioActivationFailed, uptime: invalidTime)
  expect(lines.last!.contains(" uptime_ms=0 "), "invalid timing fails closed without trapping the call path")
}
print("Native diagnostic gate/hash/sanitization: \(passed) checks PASS")
