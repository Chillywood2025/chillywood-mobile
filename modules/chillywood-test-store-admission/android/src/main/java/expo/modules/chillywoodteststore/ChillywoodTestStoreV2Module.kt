package expo.modules.chillywoodteststore

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
import java.security.MessageDigest

private fun configuration(context: Context): Map<String, String> {
  val raw = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData?.getString("SCV2_TESTSTORE_CONFIG") ?: "{}"
  val json = JSONObject(raw); return json.keys().asSequence().associateWith { key -> json.get(key) as String }
}
private fun admitted(context: Context): Map<String, String>? = TestStoreV2Contract.build(BuildConfig.DEBUG,
  context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0, context.packageName, configuration(context))

private class TestStoreV2Runtime private constructor(private val context: Context) {
  companion object {
    private var instance: TestStoreV2Runtime? = null
    fun current(context: Context): TestStoreV2Runtime = instance ?: TestStoreV2Runtime(context.applicationContext).also { instance = it }
  }
  val config = requireNotNull(admitted(context)) { "TEST_STORE_V2_NATIVE_UNAVAILABLE" }
  private val main = Handler(Looper.getMainLooper())
  private val file = AtomicFile(File(context.noBackupFilesDir, "isolated-test-store-native-v2.json"))
  private val policy: TestStoreV2Policy
  private data class Prepared(val customer: JSONObject, val allocation: JSONObject, val session: String, val fingerprint: String, val product: RevenueCatPackage)
  private val packages = mutableMapOf<String, Prepared>()
  init {
    val store = object : TestStoreV2Policy.Store {
      override fun load(): Map<String, String>? {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
        val raw = file.openRead().use { stream -> val bytes = stream.readBytes(); TestStoreV2Contract.check(bytes.size <= 32_100_000); bytes.toString(Charsets.UTF_8) }
        val json = JSONObject(raw); return json.keys().asSequence().associateWith { json.get(it) as String }
      }
      override fun commit(snapshot: Map<String, String>) {
        val data = JSONObject(snapshot).toString().toByteArray(Charsets.UTF_8); TestStoreV2Contract.check(data.size <= 32_100_000)
        val stream = file.startWrite()
        try { stream.write(data); file.finishWrite(stream) } catch (e: Exception) { file.failWrite(stream); throw e }
      }
    }
    if (store.load() == null) {
      // Pinned SDK cache presence is a veto only. It is never adopted or reset.
      val preferences = listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences")
      TestStoreV2Contract.check(!Purchases.isConfigured && preferences.none { name ->
        context.getSharedPreferences(name, Context.MODE_PRIVATE).all.keys.any { it.startsWith("com.revenuecat.") }
      })
    }
    policy = TestStoreV2Policy(store)
  }
  fun inspect(): Map<String, Any?> = mapOf("protocol" to "isolated-test-store-native-v2", "installationId" to policy.installationId(),
    "configurationDigest" to config.getValue("configId"), "customer" to if (policy.owner().isEmpty()) null else TestStoreV2Contract.map(TestStoreV2Contract.customer(policy.owner(), config, policy.installationId())),
    "processRetired" to policy.retired(), "activeInvocationId" to policy.active().ifEmpty { null })
  private fun owns(c: JSONObject, session: String) {
    policy.current(session); TestStoreV2Contract.check(policy.owner() == TestStoreV2Contract.canonical(c)
      && Purchases.isConfigured && Purchases.sharedInstance.appUserID == c.getString("providerAppUserId"))
  }
  fun bind(customerJson: String, session: String): Map<String, Any?> {
    val c = TestStoreV2Contract.customer(customerJson, config, policy.installationId())
    policy.bind(TestStoreV2Contract.canonical(c), session, { Purchases.isConfigured }, {
      val identities = mutableListOf<String>(); var footprint = false
      val prefix = "com.revenuecat.purchases." + config.getValue("publicSdkKey")
      for (name in listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences")) {
        val values = context.getSharedPreferences(name, Context.MODE_PRIVATE).all
        footprint = footprint || values.keys.any { it.startsWith("com.revenuecat.") }
        for (key in listOf(prefix, "$prefix.new")) if (values.containsKey(key)) identities.add(values[key] as String)
      }
      TestStoreV2Contract.check(TestStoreV2Policy.cacheMatches(c.getString("providerAppUserId"), footprint, identities))
      Purchases.configure(PurchasesConfiguration.Builder(context, config.getValue("publicSdkKey")).appUserID(c.getString("providerAppUserId")).build())
    }); owns(c, session); return inspect()
  }
  private fun verify(p: RevenueCatPackage, a: JSONObject) {
    val r = a.getJSONObject("registration"); val q = a.getJSONObject("quote")
    val micros = java.math.BigDecimal.valueOf(TestStoreV2Contract.number(q.get("amountMinor"))).multiply(java.math.BigDecimal(10000))
    TestStoreV2Contract.check(p.identifier == r.getString("packageIdentifier") && p.presentedOfferingContext.offeringIdentifier == r.getString("offeringIdentifier")
      && p.product.id == a.getString("productId") && p.product.type == ProductType.INAPP && p.product.period == null
      && p.product.price.currencyCode == "USD" && java.math.BigDecimal.valueOf(p.product.price.amountMicros).compareTo(micros) == 0)
  }
  fun prepare(customerJson: String, allocationJson: String, session: String, promise: Promise) {
    val c = TestStoreV2Contract.customer(customerJson, config, policy.installationId()); val a = TestStoreV2Contract.allocation(allocationJson, c); owns(c, session)
    TestStoreV2Contract.check(TestStoreV2Contract.date(a.get("acceptPurchaseUntil")) > System.currentTimeMillis())
    val dispatch = a.getString("dispatchId"); val record = JSONObject().put("customer", c).put("allocation", a).put("sessionId", session).put("invocation", TestStoreV2Contract.invocation(c, a, session))
    val document = TestStoreV2Contract.canonical(record)
    val fingerprint = MessageDigest.getInstance("SHA-256").digest(document.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    val lookup = policy.beginLookup(dispatch, session)
    fun lookupUnavailable() {
      try { policy.endLookup(lookup); promise.resolve(mapOf("status" to "package_unavailable", "handleId" to null, "invocation" to null)) }
      catch (_: Exception) { unavailable(promise) }
    }
    Purchases.sharedInstance.getCustomerInfo(object : ReceiveCustomerInfoCallback {
      override fun onError(error: PurchasesError) { main.post { lookupUnavailable() } }
      override fun onReceived(customerInfo: CustomerInfo) { main.post {
        try {
          owns(c, session); TestStoreV2Contract.check(customerInfo.originalAppUserId == c.getString("providerAppUserId"))
          Purchases.sharedInstance.getOfferings(object : ReceiveOfferingsCallback {
            override fun onError(error: PurchasesError) { main.post { lookupUnavailable() } }
            override fun onReceived(offerings: Offerings) { main.post {
              var persistenceStarted = false
              try {
                owns(c, session); val r = a.getJSONObject("registration"); val offering = requireNotNull(offerings.all[r.getString("offeringIdentifier")])
                TestStoreV2Contract.check(offering.identifier == r.getString("offeringIdentifier"))
                val found = offering.availablePackages.filter { it.identifier == r.getString("packageIdentifier") }; TestStoreV2Contract.check(found.size == 1)
                val product = found.single(); verify(product, a)
                TestStoreV2Contract.check(TestStoreV2Contract.date(a.get("acceptPurchaseUntil")) > System.currentTimeMillis())
                persistenceStarted = true
                val handle = policy.reserveAfterLookup(lookup, dispatch, session, fingerprint, document)
                packages[handle] = Prepared(c, a, session, fingerprint, product)
                promise.resolve(mapOf("status" to "prepared", "handleId" to handle, "invocation" to TestStoreV2Contract.map(record.getJSONObject("invocation"))))
              } catch (_: Exception) { if (persistenceStarted) unavailable(promise) else lookupUnavailable() }
            } }
          })
        } catch (_: Exception) { lookupUnavailable() }
      } }
    })
  }
  fun purchase(handle: String, claimJson: String, activity: Activity, promise: Promise) {
    val prepared = requireNotNull(packages[handle]); owns(prepared.customer, prepared.session); verify(prepared.product, prepared.allocation)
    val claim = TestStoreV2Contract.parse(claimJson); TestStoreV2Contract.keys(claim, listOf("protocol", "command", "requestId", "actor", "generation", "environment", "result"))
    val actor = claim.getJSONObject("actor"); val result = claim.getJSONObject("result"); TestStoreV2Contract.id(claim.get("requestId"))
    TestStoreV2Contract.keys(actor, listOf("userId", "sessionId"))
    TestStoreV2Contract.keys(result, listOf("status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"))
    TestStoreV2Contract.check(claim.get("protocol") == "isolated-test-store-v2" && claim.get("command") == "claim" && claim.get("environment") == "sandbox"
      && TestStoreV2Contract.number(claim.get("generation")) == 1L && actor.get("userId") == prepared.customer.get("buyerId") && actor.get("sessionId") == prepared.session
      && result.get("status") == "dispatch_claimed" && result.get("dispatchAllowed") == true && result.get("retryProviderMutation") == false
      && result.get("grantsAccess") == false && result.get("notPayable") == true && result.get("receipt") == JSONObject.NULL
      && TestStoreV2Contract.canonical(result.getJSONObject("customer")) == TestStoreV2Contract.canonical(prepared.customer)
      && TestStoreV2Contract.canonical(result.getJSONObject("allocation")) == TestStoreV2Contract.canonical(prepared.allocation))
    val deadline = TestStoreV2Contract.date(result.get("authorityValidUntil")); val now = System.currentTimeMillis()
    TestStoreV2Contract.check(deadline > now && deadline - now <= 5000 && !activity.isFinishing && !activity.isDestroyed)
    val dispatch = prepared.allocation.getString("dispatchId"); val record = TestStoreV2Contract.parse(requireNotNull(policy.read(dispatch)))
    record.getJSONObject("invocation").put("state", "invoking")
    policy.invoke(handle, dispatch, prepared.session, prepared.fingerprint, TestStoreV2Contract.canonical(record)); packages.remove(handle)
    owns(prepared.customer, prepared.session)
    TestStoreV2Contract.check(deadline > System.currentTimeMillis() && TestStoreV2Contract.date(prepared.allocation.get("acceptPurchaseUntil")) > System.currentTimeMillis())
    // Public native API captures THIS verified Package. No hybrid relookup or
    // caller-created Package can substitute another SKU/price/context.
    Purchases.sharedInstance.purchase(PurchaseParams.Builder(activity, prepared.product).build(), object : PurchaseCallback {
      override fun onCompleted(storeTransaction: StoreTransaction, customerInfo: CustomerInfo) { main.post {
        val matching = storeTransaction.productIds == listOf(prepared.allocation.getString("productId"))
        complete(dispatch, record, if (matching) "sdk_success" else "sdk_unknown", storeTransaction.orderId?.takeIf { matching && it.isNotBlank() && it.length <= 200 }, promise)
      } }
      override fun onError(error: PurchasesError, userCancelled: Boolean) { main.post {
        complete(dispatch, record, if (userCancelled) "sdk_cancelled" else "sdk_unknown", null, promise)
      } }
    })
  }
  private fun complete(dispatch: String, record: JSONObject, outcome: String, hint: String?, promise: Promise) {
    try {
      val invocation = record.getJSONObject("invocation").put("state", "completed").put("outcome", outcome)
        .put("transactionHint", hint ?: JSONObject.NULL).put("completedAt", TestStoreV2Contract.now())
      policy.complete(dispatch, TestStoreV2Contract.canonical(record)); promise.resolve(TestStoreV2Contract.map(invocation))
    } catch (_: Exception) { unavailable(promise) }
  }
  fun read(dispatch: String): Map<String, Any?>? {
    val raw = policy.read(dispatch) ?: return null; val invocation = TestStoreV2Contract.parse(raw).getJSONObject("invocation")
    if (invocation.get("state") == "invoking" && !policy.isNativeInvocation(dispatch)) invocation.put("state", "unknown")
    return TestStoreV2Contract.map(invocation)
  }
  fun retire(session: String) { policy.retire(session); packages.clear() }
  private fun unavailable(promise: Promise) { promise.reject("TEST_STORE_V2_NATIVE_UNAVAILABLE", "Native invocation status is unavailable; read retained history.", null) }
}

class ChillywoodTestStoreV2Module : Module() {
  private fun runtime() = TestStoreV2Runtime.current(requireNotNull(appContext.reactContext))
  override fun definition() = ModuleDefinition {
    Name("ChillywoodTestStoreV2")
    Constants {
      val context = appContext.reactContext
      val flavor = context?.packageName == TestStoreV2Policy.APPLICATION_ID || try {
        context?.packageManager?.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)?.metaData?.getBoolean("SCV2_TESTSTORE_FLAVOR", false) == true
      } catch (_: Exception) { false }
      val build = try { context?.let { admitted(it) } } catch (_: Exception) { null }
      mapOf("isolatedTestStoreV2Flavor" to flavor, "build" to build?.plus("nativeDebug" to true))
    }
    AsyncFunction("inspectInstallation") { runtime().inspect() }.runOnQueue(Queues.MAIN)
    AsyncFunction("bindCustomer") { customer: String, session: String -> runtime().bind(customer, session) }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparePackage") { customer: String, allocation: String, session: String, promise: Promise ->
      try { runtime().prepare(customer, allocation, session, promise) } catch (_: Exception) { promise.reject("TEST_STORE_V2_NATIVE_UNAVAILABLE", "Native preparation unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("purchasePrepared") { handle: String, claim: String, promise: Promise ->
      try { runtime().purchase(handle, claim, requireNotNull(appContext.currentActivity), promise) } catch (_: Exception) { promise.reject("TEST_STORE_V2_NATIVE_UNAVAILABLE", "Native invocation status unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readInvocation") { dispatch: String -> runtime().read(dispatch) }.runOnQueue(Queues.MAIN)
    AsyncFunction("retireSession") { session: String -> runtime().retire(session) }.runOnQueue(Queues.MAIN)
  }
}
