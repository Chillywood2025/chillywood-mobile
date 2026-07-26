import ExpoModulesCore

public final class ChillywoodNativeCallsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChillywoodNativeCalls")

    Events("onNativeCallEvent")

    OnStartObserving {
      ChillywoodNativeCallCoordinator.shared.eventSink = { [weak self] event in
        self?.sendEvent("onNativeCallEvent", event)
      }
    }

    OnStopObserving {
      ChillywoodNativeCallCoordinator.shared.eventSink = nil
    }

    AsyncFunction("isBuildEnabledAsync") {
      ChillywoodNativeCallCoordinator.shared.isBuildEnabled
    }

    AsyncFunction("startVoipRegistrationAsync") { () -> Bool in
      try ChillywoodNativeCallCoordinator.shared.startVoipRegistration()
      return true
    }

    AsyncFunction("stopVoipRegistrationAsync") { () -> Bool in
      ChillywoodNativeCallCoordinator.shared.stopVoipRegistration()
      return true
    }

    AsyncFunction("getPendingEventsAsync") { () -> [[String: Any]] in
      ChillywoodNativeCallCoordinator.shared.drainPendingEvents()
    }

    AsyncFunction("reportIncomingCallAsync") { (payload: [String: Any]) async throws -> String in
      try await ChillywoodNativeCallCoordinator.shared.reportIncomingCall(payload: payload)
    }

    AsyncFunction("endCallAsync") { (callUuid: String, reason: String?) in
      try ChillywoodNativeCallCoordinator.shared.endCall(callUuid: callUuid, reason: reason ?? "local_end")
    }

    AsyncFunction("reportRemoteEndAsync") { (callUuid: String, reason: String?) in
      try ChillywoodNativeCallCoordinator.shared.reportRemoteEnd(callUuid: callUuid, reason: reason ?? "remote_end")
    }

    AsyncFunction("completeAnswerAsync") { (callUuid: String, connected: Bool) in
      try ChillywoodNativeCallCoordinator.shared.completeAnswer(callUuid: callUuid, connected: connected)
    }

    AsyncFunction("setMutedAsync") { (callUuid: String, muted: Bool) in
      try ChillywoodNativeCallCoordinator.shared.setMuted(callUuid: callUuid, muted: muted)
    }

    AsyncFunction("setAudioRouteAsync") { (route: String) in
      try ChillywoodNativeCallCoordinator.shared.setAudioRoute(route)
    }

    AsyncFunction("presentDebugIncomingCallAsync") { (payload: [String: Any]?) async throws -> String in
      #if DEBUG
      return try await ChillywoodNativeCallCoordinator.shared.reportDebugIncomingCall(payload: payload ?? [:])
      #else
      throw ChillywoodNativeCallError.debugTriggerUnavailable
      #endif
    }
  }
}
