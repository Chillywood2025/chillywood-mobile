import ExpoModulesCore

public final class ChillywoodCameraEffectsModule: Module {
  private let controller = CHCameraEffectsController()

  public func definition() -> ModuleDefinition {
    Name("ChillywoodCameraEffects")

    Function("capabilities") { () -> [String: Any] in
      self.controller.attachBridge(self.appContext?.reactBridge)
      return self.controller.capabilities()
    }

    // Synchronous so Off invalidates in-flight inference/render work before JS
    // subsequently removes the processor from the media track.
    Function("configure") { (trackId: String, effect: String, intensity: Double) -> [String: Any] in
      self.controller.attachBridge(self.appContext?.reactBridge)
      return self.controller.configure(trackId, effect: effect, intensity: intensity)
    }

    Function("release") { (trackId: String) in
      self.controller.releaseTrack(trackId)
    }

    Function("status") { (trackId: String) -> [String: Any] in
      self.controller.status(trackId)
    }

    // Native lifecycle listeners run even when the JS thread is paused.
    OnAppEntersBackground {
      self.controller.suspend()
    }

    OnAppBecomesActive {
      self.controller.resume()
    }

    OnDestroy {
      self.controller.invalidate()
    }
  }
}
