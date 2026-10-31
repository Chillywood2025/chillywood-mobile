package expo.modules.chillywoodexternalcontentlinks

import android.os.Handler
import android.os.Looper
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ChillywoodExternalContentLinksModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var flow: ExternalLinkFlow? = null
  private var foreground = true
  private var destroyed = false

  override fun definition() = ModuleDefinition {
    Name("ChillywoodExternalContentLinks")
    Function("capabilities") {
      mapOf("apiVersion" to 1, "program" to "external_content_link", "billingLibraryVersion" to "8.2.1")
    }
    AsyncFunction("prepare") { promise: Promise ->
      if (activeActivity() == null) {
        promise.reject("ECL_ACTIVITY_UNAVAILABLE", "Google Play checkout requires an active app.", null)
      } else {
        currentFlow().prepare(reply(promise, true))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("launch") { flowId: String, url: String, promise: Promise ->
      val current = flow
      if (activeActivity() == null || current == null) {
        promise.reject("ECL_FLOW_EXPIRED", "Restart checkout from the app.", null)
      } else {
        current.launch(flowId, url, reply(promise, false))
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("cancel") { flowId: String -> flow?.cancel(flowId) }.runOnQueue(Queues.MAIN)
    OnActivityEntersForeground { handler.post { foreground = true } }
    OnActivityEntersBackground { handler.post { foreground = false; flow?.background() } }
    OnActivityDestroys { handler.post { foreground = false; flow?.destroy(); flow = null } }
    OnDestroy { handler.post { destroyed = true; flow?.destroy(); flow = null } }
  }

  private fun currentFlow(): ExternalLinkFlow {
    flow?.let { return it }
    val context = requireNotNull(appContext.reactContext)
    var expiration: Runnable? = null
    return ExternalLinkFlow(
      { GooglePlayTransport(context) { activeActivity() } },
      object : ExternalLinkFlow.Deadline {
        override fun start(expired: Runnable) {
          expiration = expired
          handler.postDelayed(expired, 120_000)
        }
        override fun clear() {
          expiration?.let { handler.removeCallbacks(it) }
          expiration = null
        }
      }
    ).also { flow = it }
  }
  private fun activeActivity(): android.app.Activity? {
    if (!foreground || destroyed) return null
    val activity = appContext.currentActivity ?: return null
    val owner = activity as? LifecycleOwner ?: return null
    if (activity.isFinishing || activity.isDestroyed || !owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return null
    return activity
  }
  private fun reply(promise: Promise, includeToken: Boolean) = object : ExternalLinkFlow.Reply {
    override fun success(flowId: String, token: String?) {
      if (includeToken) promise.resolve(mapOf("flowId" to flowId, "externalTransactionToken" to token))
      else promise.resolve(mapOf("launched" to true))
    }
    override fun failure(code: String) {
      // Never expose provider debug messages or tokens to application diagnostics.
      promise.reject(code, "Google Play checkout did not open. Return to the app to try again.", null)
    }
  }
}
