package expo.modules.chillywoodcameraeffects

import android.os.Build
import com.oney.WebRTCModule.ChillywoodProcessorRegistry
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class ChillywoodCameraEffectsModule : Module() {
  private data class Registration(val name: String, val processor: CameraEffectProcessor)
  private val registrations = mutableMapOf<String, Registration>()
  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("ChillywoodCameraEffects")

    Function("capabilities") {
      mapOf(
        "studioLighting" to (Build.VERSION.SDK_INT >= 24),
        "chicagoSkyline" to (Build.VERSION.SDK_INT >= 24),
        "crimsonAura" to (Build.VERSION.SDK_INT >= 24),
        "neonEdge" to (Build.VERSION.SDK_INT >= 24),
        "spotlight" to (Build.VERSION.SDK_INT >= 24),
        "depthMode" to "subject-parallax"
      )
    }

    Function("configure") { trackId: String, effect: String, intensity: Double ->
      require(trackId.isNotBlank()) { "A local camera track is required" }
      require(effect in setOf("off", "studio-light", "chicago-skyline", "crimson-aura", "neon-edge", "spotlight")) { "Unknown camera effect" }
      require(intensity.isFinite()) { "Camera effect intensity must be finite" }
      synchronized(lock) {
        releaseLocked(trackId)
        if (effect == "off" || intensity <= 0.0) {
          mapOf("processorName" to null)
        } else {
          val name = "chillywood-camera-${UUID.randomUUID()}"
          val processor = CameraEffectProcessor(effect, intensity.coerceIn(0.0, 1.0).toFloat())
          // Enqueue before returning: JS's subsequent _setVideoEffects uses this
          // exact executor, so registration always precedes provider lookup.
          ChillywoodProcessorRegistry.register(name, processor)
          registrations[trackId] = Registration(name, processor)
          mapOf("processorName" to name)
        }
      }
    }

    Function("release") { trackId: String ->
      synchronized(lock) { releaseLocked(trackId) }
    }

    Function("status") { trackId: String ->
      synchronized(lock) {
        registrations[trackId]?.processor?.status()
          ?: mapOf("state" to "off", "processedFrames" to 0)
      }
    }

    OnActivityEntersBackground { releaseAll() }
    OnDestroy { releaseAll() }
  }

  private fun releaseLocked(trackId: String) {
    registrations.remove(trackId)?.let {
      // Closing is synchronous. An attached stale processor immediately passes
      // original frames while the WebRTC executor catches up with removal.
      it.processor.close()
      ChillywoodProcessorRegistry.remove(it.name)
    }
  }

  private fun releaseAll() = synchronized(lock) {
    registrations.keys.toList().forEach(::releaseLocked)
  }
}
