package expo.modules.chillywoodqualification

import android.app.Activity
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import com.revenuecat.purchases.*
import com.revenuecat.purchases.Package as RevenueCatPackage
import com.revenuecat.purchases.interfaces.*
import com.revenuecat.purchases.models.StoreTransaction
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.util.UUID

private class QualificationRuntime private constructor(private val context: Context) {
  companion object {
    private var instance: QualificationRuntime? = null
    fun current(context: Context): QualificationRuntime = instance ?: QualificationRuntime(context.applicationContext).also { instance = it }
  }
  private val raw = JSONObject(context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData?.getString("SCQ_QUALIFICATION_CONFIG") ?: "{}")
  private val config = QualificationContract.build(BuildConfig.DEBUG, context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0, context.packageName, raw)
  private val file = AtomicFile(File(context.noBackupFilesDir, "scq-native-v1.json"))
  private val main = Handler(Looper.getMainLooper())
  private val policy: QualificationPolicy
  private data class Prepared(val record: JSONObject, val scenario: JSONObject, val fingerprint: String, val product: RevenueCatPackage)
  private val prepared = mutableMapOf<String, Prepared>()
  init {
    val store = object : QualificationPolicy.Store {
      override fun load(): Map<String, String>? {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
        val bytes = file.openRead().use { it.readBytes() }; QualificationContract.check(bytes.size <= 1_100_000)
        val value = JSONObject(bytes.toString(Charsets.UTF_8)); return value.keys().asSequence().associateWith { value.get(it) as String }
      }
      override fun commit(snapshot: Map<String, String>) {
        val bytes = JSONObject(snapshot).toString().toByteArray(Charsets.UTF_8); QualificationContract.check(bytes.size <= 1_100_000)
        val stream = file.startWrite()
        try { stream.write(bytes); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
      }
    }
    if (store.load() == null) {
      QualificationContract.check(!Purchases.isConfigured && listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences").none { name ->
        context.getSharedPreferences(name, Context.MODE_PRIVATE).all.keys.any { it.startsWith("com.revenuecat.") }
      })
    }
    policy = QualificationPolicy(store)
  }
  private val run: String get() = config.getString("runId")
  private val uid: String get() = "scq_teststore_" + policy.installationId()
  private fun owner(): String = JSONObject().put("configurationDigest", raw.getString("configurationDigest")).put("providerAppUserId", uid).put("runId", run).toString()
  private fun owns() { policy.current(run); QualificationContract.check(policy.owner() == owner() && Purchases.isConfigured && Purchases.sharedInstance.appUserID == uid) }
  fun inspect(): Map<String, Any?> {
    val records = policy.records().map { stored ->
      val record = QualificationContract.parse(stored)
      if (record.getString("state") == "invoking" && !policy.isNativeInvocation(record.getString("invocationId"))) record.put("state", "unknown")
      QualificationContract.map(record)
    }
    return mapOf("protocol" to "test-store-qualification-native-v1", "configurationDigest" to raw.getString("configurationDigest"),
      "installationId" to policy.installationId(), "providerAppUserId" to uid, "runId" to run, "closed" to policy.sealed(), "configured" to policy.configuredLocally(),
      "activeInvocationId" to policy.active().ifEmpty { null }, "scenarios" to QualificationContract.value(config.getJSONArray("scenarios")), "records" to records)
  }
  fun configure() {
    policy.bind(owner(), run, { Purchases.isConfigured }, {
      val identities = mutableListOf<String>(); var footprint = false; val prefix = "com.revenuecat.purchases." + raw.getString("publicSdkKey")
      for (name in listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences")) {
        val values = context.getSharedPreferences(name, Context.MODE_PRIVATE).all
        footprint = footprint || values.keys.any { it.startsWith("com.revenuecat.") }
        for (key in listOf(prefix, "$prefix.new")) if (values.containsKey(key)) identities.add(values[key] as String)
      }
      QualificationContract.check(QualificationPolicy.cacheMatches(uid, footprint, identities))
      Purchases.configure(PurchasesConfiguration.Builder(context, raw.getString("publicSdkKey")).appUserID(uid).build())
    }); owns()
  }
  private fun verify(product: RevenueCatPackage, scenario: JSONObject) {
    val micros = java.math.BigDecimal.valueOf(QualificationContract.number(scenario.get("amountMinor"))).multiply(java.math.BigDecimal(10000))
    QualificationContract.check(product.identifier == scenario.getString("packageIdentifier") && product.presentedOfferingContext.offeringIdentifier == scenario.getString("offeringIdentifier")
      && product.product.id == scenario.getString("productId") && product.product.type == ProductType.INAPP && product.product.period == null
      && product.product.price.currencyCode == "USD" && java.math.BigDecimal.valueOf(product.product.price.amountMicros).compareTo(micros) == 0)
  }
  fun prepare(scenarioId: String, promise: Promise) {
    owns(); val scenarios = config.getJSONArray("scenarios")
    val scenario = requireNotNull((0 until scenarios.length()).map { scenarios.getJSONObject(it) }.firstOrNull { it.getString("id") == scenarioId })
    val invocationId = UUID.randomUUID().toString()
    val lookup = policy.beginLookup(invocationId, run)
    fun missing() { try { policy.endLookup(lookup); promise.resolve(mapOf("status" to "package_unavailable", "handleId" to null, "record" to null)) } catch (_: Exception) { unavailable(promise) } }
    Purchases.sharedInstance.getCustomerInfo(object : ReceiveCustomerInfoCallback {
      override fun onError(error: PurchasesError) { main.post { missing() } }
      override fun onReceived(customerInfo: CustomerInfo) { main.post {
        try {
          owns(); QualificationContract.check(customerInfo.originalAppUserId == uid)
          Purchases.sharedInstance.getOfferings(object : ReceiveOfferingsCallback {
            override fun onError(error: PurchasesError) { main.post { missing() } }
            override fun onReceived(offerings: Offerings) { main.post {
              var persistenceStarted = false
              try {
                owns(); val offering = requireNotNull(offerings.all[scenario.getString("offeringIdentifier")])
                QualificationContract.check(offering.identifier == scenario.getString("offeringIdentifier"))
                val candidates = offering.availablePackages.filter { it.identifier == scenario.getString("packageIdentifier") }
                QualificationContract.check(candidates.size == 1); val product = candidates.single(); verify(product, scenario)
                val record = JSONObject().put("protocol", "test-store-qualification-record-v1").put("invocationId", invocationId).put("scenarioId", scenarioId)
                  .put("runId", run).put("configurationDigest", raw.getString("configurationDigest")).put("providerAppUserId", uid)
                  .put("state", "prepared").put("outcome", JSONObject.NULL).put("createdAt", QualificationContract.now()).put("completedAt", JSONObject.NULL)
                listOf("offeringIdentifier", "packageIdentifier", "productId", "amountMinor", "currency").forEach { record.put(it, scenario.get(it)) }
                val document = record.toString()
                val fingerprint = QualificationContract.hash(document); persistenceStarted = true
                val handle = policy.reserveAfterLookup(lookup, invocationId, run, fingerprint, document)
                prepared[handle] = Prepared(record, scenario, fingerprint, product)
                promise.resolve(mapOf("status" to "prepared", "handleId" to handle, "record" to QualificationContract.map(record)))
              } catch (_: Exception) { if (persistenceStarted) unavailable(promise) else missing() }
            } }
          })
        } catch (_: Exception) { missing() }
      } }
    })
  }
  fun purchase(handle: String, activity: Activity, promise: Promise) {
    owns(); val selection = requireNotNull(prepared[handle]); verify(selection.product, selection.scenario)
    QualificationContract.check(!activity.isFinishing && !activity.isDestroyed)
    val record = QualificationContract.parse(selection.record.toString()).put("state", "invoking")
    val invocationId = record.getString("invocationId")
    policy.invoke(handle, invocationId, run, selection.fingerprint, record.toString()); prepared.remove(handle); owns()
    // This exact SDK-returned Package survives the explicit user review. There
    // is no hybrid relookup, customer switch or caller-created package.
    Purchases.sharedInstance.purchase(PurchaseParams.Builder(activity, selection.product).build(), object : PurchaseCallback {
      override fun onCompleted(storeTransaction: StoreTransaction, customerInfo: CustomerInfo) { main.post {
        complete(invocationId, record, if (storeTransaction.productIds == listOf(selection.scenario.getString("productId"))) "sdk_success" else "sdk_unknown", promise)
      } }
      override fun onError(error: PurchasesError, userCancelled: Boolean) { main.post { complete(invocationId, record, if (userCancelled) "sdk_cancelled" else "sdk_unknown", promise) } }
    })
  }
  private fun complete(invocationId: String, record: JSONObject, outcome: String, promise: Promise) {
    try {
      record.put("state", "completed").put("outcome", outcome).put("completedAt", QualificationContract.now())
      policy.complete(invocationId, record.toString()); promise.resolve(QualificationContract.map(record))
    } catch (_: Exception) { unavailable(promise) }
  }
  fun seal() { policy.seal(); prepared.clear() }
  private fun unavailable(promise: Promise) { promise.reject("QUALIFICATION_NATIVE_UNAVAILABLE", "Read retained local evidence; do not repeat unknown native work.", null) }
}

class ChillywoodQualificationModule : Module() {
  private fun runtime() = QualificationRuntime.current(requireNotNull(appContext.reactContext))
  override fun definition() = ModuleDefinition {
    Name("ChillywoodQualification")
    AsyncFunction("inspect") { runtime().inspect() }.runOnQueue(Queues.MAIN)
    AsyncFunction("configure") { runtime().configure() }.runOnQueue(Queues.MAIN)
    AsyncFunction("prepare") { scenarioId: String, promise: Promise ->
      try { runtime().prepare(scenarioId, promise) } catch (_: Exception) { promise.reject("QUALIFICATION_NATIVE_UNAVAILABLE", "Native Package unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("purchase") { handle: String, promise: Promise ->
      try { runtime().purchase(handle, requireNotNull(appContext.currentActivity), promise) } catch (_: Exception) { promise.reject("QUALIFICATION_NATIVE_UNAVAILABLE", "Native outcome unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("seal") { runtime().seal() }.runOnQueue(Queues.MAIN)
  }
}
