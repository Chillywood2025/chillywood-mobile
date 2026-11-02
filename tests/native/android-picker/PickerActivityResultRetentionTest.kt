package expo.modules.kotlin.activityresult

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import expo.modules.kotlin.providers.CurrentActivityProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Runs the actual patched Expo registry with AndroidX lifecycle + Robolectric. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class PickerActivityResultRetentionTest {
  class HostActivity : AppCompatActivity() {
    override fun onCreate(state: Bundle?) {
      setTheme(androidx.appcompat.R.style.Theme_AppCompat)
      super.onCreate(state)
    }
  }

  private class Provider : CurrentActivityProvider {
    override var currentActivity: Activity? = null
  }

  private open class Contract(private val retain: Boolean = true) : AppContextActivityResultContract<String, String>, AppContextActivityResultRetention<String> {
    override fun shouldRetainCallbackOnHostDestroy(input: String) = retain && input != "editing"
    override fun createIntent(context: Context, input: String) = Intent(Intent.ACTION_GET_CONTENT)
    override fun parseResult(input: String, resultCode: Int, intent: Intent?) = "$input/$resultCode"
  }

  private class Fixture {
    val provider = Provider()
    val registry = AppContextActivityResultRegistry(provider)
    var host = Robolectric.buildActivity(HostActivity::class.java).setup()
    val oldResults = mutableListOf<String>()
    val newResults = mutableListOf<String>()
    val fallbacks = mutableListOf<String>()
    init { provider.currentActivity = host.get() }

    fun register(key: String, contract: AppContextActivityResultContract<String, String> = Contract()) =
      registry.register(key, host.get(), contract) { _, result -> fallbacks.add(result) }

    fun launch(key: String = "old", input: String = "asset", contract: AppContextActivityResultContract<String, String> = Contract(), callback: (String) -> Unit = { oldResults.add(it) }): Int {
      register(key, contract).launch(input) { callback(it) }
      return shadowOf(host.get()).nextStartedActivityForResult.requestCode
    }

    fun destroyHost() { host.pause().stop().destroy(); provider.currentActivity = null }
    fun recreate() {
      host = Robolectric.buildActivity(HostActivity::class.java).setup()
      provider.currentActivity = host.get()
    }

    @Suppress("UNCHECKED_CAST")
    fun map(name: String): Map<Any, Any> = field(name) as Map<Any, Any>
    fun field(name: String): Any = AppContextActivityResultRegistry::class.java.getDeclaredField(name).apply { isAccessible = true }.get(registry)
    fun assertReleased(key: String, requestCode: Int) {
      for (name in listOf("keyToCallbacksAndContract", "keyToInputParam", "keyToRequestCode", "keyToLifecycleContainers")) {
        assertFalse("$name retained $key", map(name).containsKey(key))
      }
      assertFalse(map("requestCodeToKey").containsKey(requestCode))
      assertFalse((field("launchedKeys") as Collection<*>).contains(key))
      assertFalse((field("retainedCallbackKeys") as Collection<*>).contains(key))
      assertFalse((field("pendingResults") as Bundle).containsKey(key))
    }
  }

  @Test fun successAndCancelResumeOnlyOriginalAfterRecreation() {
    for (result in listOf(Activity.RESULT_OK, Activity.RESULT_CANCELED)) {
      val f = Fixture()
      val oldCode = f.launch()
      f.destroyHost()
      assertFalse(f.map("keyToLifecycleContainers").containsKey("old"))
      f.recreate()
      val newCode = f.launch("new", "new-asset", callback = { f.newResults.add(it) })
      assertTrue(f.registry.dispatchResult(oldCode, result, null))
      assertEquals(listOf("asset/$result"), f.oldResults)
      assertTrue(f.newResults.isEmpty())
      assertTrue(f.fallbacks.isEmpty())
      f.assertReleased("old", oldCode)
      assertFalse(f.registry.dispatchResult(oldCode, result, null))
      assertTrue(f.registry.dispatchResult(newCode, Activity.RESULT_OK, null))
      assertEquals(listOf("new-asset/${Activity.RESULT_OK}"), f.newResults)
    }
  }

  @Test fun resultBeforeReplacementResumeStillSettlesWithoutNewNativeUi() {
    val f = Fixture()
    val code = f.launch()
    f.destroyHost()
    assertTrue(f.registry.dispatchResult(code, Activity.RESULT_CANCELED, null))
    assertEquals(listOf("asset/${Activity.RESULT_CANCELED}"), f.oldResults)
    f.assertReleased("old", code)
  }

  @Test fun repeatedHostRecreationAndReentrantDuplicateStillSettleOnce() {
    val f = Fixture()
    var code = 0
    var callbacks = 0
    code = f.launch(callback = {
      callbacks += 1
      assertTrue(f.registry.dispatchResult(code, Activity.RESULT_OK, null))
    })
    f.destroyHost()
    repeat(2) { index ->
      f.recreate()
      f.register("new-idle-$index")
      f.destroyHost()
    }
    assertTrue(f.registry.dispatchResult(code, Activity.RESULT_OK, null))
    assertEquals(1, callbacks)
    f.assertReleased("old", code)
    assertFalse(f.registry.dispatchResult(code, Activity.RESULT_OK, null))
  }

  @Test fun throwingParserAndCallbackReleaseOnlyRetainedKey() {
    for (parseThrows in listOf(true, false)) {
      val f = Fixture()
      val contract = object : Contract() {
        override fun parseResult(input: String, resultCode: Int, intent: Intent?): String {
          if (parseThrows) throw IllegalArgumentException("parser sentinel")
          return super.parseResult(input, resultCode, intent)
        }
      }
      val code = f.launch(contract = contract, callback = { throw IllegalArgumentException("callback sentinel") })
      f.destroyHost()
      f.recreate()
      f.register("new")
      try {
        f.registry.dispatchResult(code, Activity.RESULT_OK, null)
        fail("Expected sentinel failure")
      } catch (expected: IllegalArgumentException) { assertTrue(expected.message!!.endsWith("sentinel")) }
      f.assertReleased("old", code)
      assertTrue(f.map("keyToRequestCode").containsKey("new"))
    }
  }

  @Test fun idleLegacyAndEditingRequestsKeepUpstreamUnregistration() {
    val f = Fixture()
    f.register("idle")
    val legacyCode = f.launch("legacy", contract = Contract(false))
    val editingCode = f.launch("editing", "editing")
    f.destroyHost()
    assertTrue(f.map("keyToCallbacksAndContract").isEmpty())
    assertFalse(f.map("keyToRequestCode").containsKey("idle"))
    // Legacy mappings stay in flight exactly as upstream; this patch does not
    // pretend to repair the vendor's unsupported editing/recovery pipeline.
    assertTrue(f.registry.dispatchResult(legacyCode, Activity.RESULT_OK, null))
    assertTrue(f.registry.dispatchResult(editingCode, Activity.RESULT_OK, null))
    assertTrue(f.oldResults.isEmpty())
  }

  @Test fun defaultContractDoesNotOptIn() {
    val contract = object : AppContextActivityResultContract<String, String> {
      override fun createIntent(context: Context, input: String) = Intent()
      override fun parseResult(input: String, resultCode: Int, intent: Intent?) = input
    }
    assertFalse((contract as Any) is AppContextActivityResultRetention<*>)
  }

  @Test fun fullContextDisposalAndLateResultCannotRetainOrDeliver() {
    for (destroyHost in listOf(true, false)) {
      val f = Fixture()
      val code = f.launch()
      if (destroyHost) f.destroyHost()
      f.registry.disposeRetainedCallbacks()
      f.assertReleased("old", code)
      assertFalse(f.registry.dispatchResult(code, Activity.RESULT_OK, null))
      assertTrue(f.oldResults.isEmpty())
    }
  }

  @Test fun processSnapshotExcludesOwnerBoundRequestsButPreservesLegacy() {
    val f = Fixture()
    val code = f.launch()
    f.launch("legacy", "legacy-asset", Contract(false))
    f.registry.persistInstanceState(f.host.get())
    val restored = AppContextActivityResultRegistry(f.provider)
    restored.restoreInstanceState(f.host.get())
    assertFalse(restored.dispatchResult(code, Activity.RESULT_OK, null))
    val keys = AppContextActivityResultRegistry::class.java.getDeclaredField("keyToRequestCode").apply { isAccessible = true }.get(restored) as Map<*, *>
    assertEquals(setOf("legacy"), keys.keys)
    // Persisting did not alter the live owner or its still-running callback.
    f.destroyHost()
    assertTrue(f.registry.dispatchResult(code, Activity.RESULT_CANCELED, null))
    assertEquals(listOf("asset/${Activity.RESULT_CANCELED}"), f.oldResults)
  }

  @Test fun ordinaryCompletedLauncherRemainsReusable() {
    val f = Fixture()
    val launcher = f.register("same")
    repeat(2) { index ->
      launcher.launch("asset-$index") { f.oldResults.add(it) }
      val code = shadowOf(f.host.get()).nextStartedActivityForResult.requestCode
      assertTrue(f.registry.dispatchResult(code, Activity.RESULT_OK, null))
    }
    assertEquals(2, f.oldResults.size)
    assertTrue(f.map("keyToRequestCode").containsKey("same"))
  }

  @Test fun launchFailureDoesNotBecomeARetainedInFlightRequest() {
    val f = Fixture()
    val contract = object : Contract() {
      override fun createIntent(context: Context, input: String): Intent = throw IllegalArgumentException("launch sentinel")
    }
    try { f.register("failed", contract).launch("asset") { }; fail("Expected launch failure") }
    catch (expected: IllegalArgumentException) { assertEquals("launch sentinel", expected.message) }
    f.destroyHost()
    assertFalse(f.map("keyToCallbacksAndContract").containsKey("failed"))
    assertFalse(f.map("keyToRequestCode").containsKey("failed"))
  }
}
