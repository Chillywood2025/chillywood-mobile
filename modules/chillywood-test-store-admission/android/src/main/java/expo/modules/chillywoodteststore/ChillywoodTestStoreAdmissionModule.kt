package expo.modules.chillywoodteststore

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class ChillywoodTestStoreAdmissionModule : Module() {
  private fun config(context: Context): Map<String, String> {
    return try {
      val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val json = JSONObject(info.metaData?.getString("SCV1_TESTSTORE_CONFIG") ?: "{}")
      val values = mutableMapOf<String, String>()
      for (key in json.keys()) { val value = json.get(key); if (value !is String) return emptyMap(); values[key] = value }
      values
    } catch (_: Exception) { emptyMap() }
  }
  private fun appDebug(context: Context) = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  private fun flavor(context: Context): Boolean = context.packageName == TestStoreAdmissionPolicy.APPLICATION_ID || try {
    context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData?.getBoolean("SCV1_TESTSTORE_FLAVOR", false) == true
  } catch (_: Exception) { false }
  override fun definition() = ModuleDefinition {
    Name("ChillywoodTestStoreAdmission")
    Constants {
      val context = appContext.reactContext
      val flavor = context?.let { flavor(it) } == true
      val build = context?.let { TestStoreAdmissionPolicy.snapshot(BuildConfig.DEBUG, appDebug(it), it.packageName, config(it)) }
      mapOf("isolatedTestStoreFlavor" to flavor, "build" to build?.plus("nativeDebug" to true))
    }
    AsyncFunction("configureTestStore") { providerAppUserId: String ->
      val context = requireNotNull(appContext.reactContext) { "TEST_STORE_BUILD_UNAVAILABLE" }
      val immutable = config(context)
      val admitted = TestStoreAdmissionPolicy.configure(BuildConfig.DEBUG, appDebug(context), context.packageName, immutable, providerAppUserId,
        { Purchases.isConfigured }, {
          Purchases.configure(PurchasesConfiguration.Builder(context, immutable.getValue("publicSdkKey")).appUserID(providerAppUserId).build())
        })
      mapOf("configured" to true, "configId" to admitted.getValue("configId"), "providerAppUserId" to providerAppUserId)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("ownsProviderIdentity") { providerAppUserId: String ->
      TestStoreAdmissionPolicy.owns(providerAppUserId) { Purchases.isConfigured && Purchases.sharedInstance.appUserID == providerAppUserId }
    }.runOnQueue(Queues.MAIN)
  }
}
