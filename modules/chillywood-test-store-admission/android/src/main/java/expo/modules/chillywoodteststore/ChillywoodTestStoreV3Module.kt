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
  val raw = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData?.getString("SCV3_TESTSTORE_CONFIG") ?: "{}"
  val json = JSONObject(raw); return json.keys().asSequence().associateWith { key -> json.get(key) as String }
}
private fun admitted(context: Context): Map<String, String>? = TestStoreV3Contract.build(BuildConfig.DEBUG,
  context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0, context.packageName, configuration(context))

private class TestStoreV3Runtime private constructor(private val context: Context) {
  companion object {
    private var instance: TestStoreV3Runtime? = null
    fun current(context: Context): TestStoreV3Runtime = instance ?: TestStoreV3Runtime(context.applicationContext).also { instance = it }
  }
  val config = requireNotNull(admitted(context)) { "TEST_STORE_V3_NATIVE_UNAVAILABLE" }
  private val main = Handler(Looper.getMainLooper())
  private val file = AtomicFile(File(context.noBackupFilesDir, "isolated-test-store-native-v3.json"))
  private val policy: TestStoreV3Policy
  private data class Prepared(val customer: JSONObject, val allocation: JSONObject, val session: String, val fingerprint: String, val product: RevenueCatPackage)
  private val packages = mutableMapOf<String, Prepared>()
  init {
    val store = object : TestStoreV3Policy.Store {
      override fun load(): Map<String, String>? {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
        val raw = file.openRead().use { stream -> val bytes = stream.readBytes(); TestStoreV3Contract.check(bytes.size <= 32_100_000); bytes.toString(Charsets.UTF_8) }
        val json = JSONObject(raw); return json.keys().asSequence().associateWith { json.get(it) as String }
      }
      override fun commit(snapshot: Map<String, String>) {
        val data = JSONObject(snapshot).toString().toByteArray(Charsets.UTF_8); TestStoreV3Contract.check(data.size <= 32_100_000)
        val stream = file.startWrite()
        try { stream.write(data); file.finishWrite(stream) } catch (e: Exception) { file.failWrite(stream); throw e }
      }
    }
    if (store.load() == null) {
      // Pinned SDK cache presence is a veto only. It is never adopted or reset.
      val preferences = listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences")
      TestStoreV3Contract.check(!Purchases.isConfigured && preferences.none { name ->
        context.getSharedPreferences(name, Context.MODE_PRIVATE).all.keys.any { it.startsWith("com.revenuecat.") }
      })
    }
    policy = TestStoreV3Policy(store)
  }
  fun inspect(): Map<String, Any?> = mapOf("protocol" to "isolated-test-store-native-v3", "installationId" to policy.installationId(),
    "configurationDigest" to config.getValue("configId"), "customer" to if (policy.owner().isEmpty()) null else TestStoreV3Contract.map(TestStoreV3Contract.customer(policy.owner(), config, policy.installationId())),
    "processRetired" to policy.retired(), "activeInvocationId" to policy.active().ifEmpty { null })
  private fun owns(c: JSONObject, session: String) {
    policy.current(session); TestStoreV3Contract.check(policy.owner() == TestStoreV3Contract.canonical(c)
      && Purchases.isConfigured && Purchases.sharedInstance.appUserID == c.getString("providerAppUserId"))
  }
  fun bind(customerJson: String, session: String): Map<String, Any?> {
    val c = TestStoreV3Contract.customer(customerJson, config, policy.installationId())
    policy.bind(TestStoreV3Contract.canonical(c), session, { Purchases.isConfigured }, {
      val identities = mutableListOf<String>(); var footprint = false
      val prefix = "com.revenuecat.purchases." + config.getValue("publicSdkKey")
      for (name in listOf("com_revenuecat_purchases_preferences", context.packageName + "_preferences")) {
        val values = context.getSharedPreferences(name, Context.MODE_PRIVATE).all
        footprint = footprint || values.keys.any { it.startsWith("com.revenuecat.") }
        for (key in listOf(prefix, "$prefix.new")) if (values.containsKey(key)) identities.add(values[key] as String)
      }
      TestStoreV3Contract.check(TestStoreV3Policy.cacheMatches(c.getString("providerAppUserId"), footprint, identities))
      Purchases.configure(PurchasesConfiguration.Builder(context, config.getValue("publicSdkKey")).appUserID(c.getString("providerAppUserId")).build())
    }); owns(c, session); return inspect()
  }
  private fun verify(p: RevenueCatPackage, a: JSONObject) {
    val r = a.getJSONObject("registration"); val q = a.getJSONObject("quote")
    val micros = java.math.BigDecimal.valueOf(TestStoreV3Contract.number(q.get("amountMinor"))).multiply(java.math.BigDecimal(10000))
    TestStoreV3Contract.check(p.identifier == r.getString("packageIdentifier") && p.presentedOfferingContext.offeringIdentifier == r.getString("offeringIdentifier")
      && p.product.id == a.getString("productId") && p.product.type == ProductType.INAPP && p.product.period == null
      && p.product.price.currencyCode == "USD" && java.math.BigDecimal.valueOf(p.product.price.amountMicros).compareTo(micros) == 0)
  }
  fun prepare(customerJson: String, allocationJson: String, session: String, promise: Promise) {
    val c = TestStoreV3Contract.customer(customerJson, config, policy.installationId()); val a = TestStoreV3Contract.allocation(allocationJson, c); owns(c, session)
    TestStoreV3Contract.check(TestStoreV3Contract.date(a.get("acceptPurchaseUntil")) > System.currentTimeMillis())
    val dispatch = a.getString("dispatchId"); val record = JSONObject().put("customer", c).put("allocation", a).put("sessionId", session).put("invocation", TestStoreV3Contract.invocation(c, a, session))
    val document = TestStoreV3Contract.canonical(record)
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
          owns(c, session); TestStoreV3Contract.check(customerInfo.originalAppUserId == c.getString("providerAppUserId"))
          Purchases.sharedInstance.getOfferings(object : ReceiveOfferingsCallback {
            override fun onError(error: PurchasesError) { main.post { lookupUnavailable() } }
            override fun onReceived(offerings: Offerings) { main.post {
              var persistenceStarted = false
              try {
                owns(c, session); val r = a.getJSONObject("registration"); val offering = requireNotNull(offerings.all[r.getString("offeringIdentifier")])
                TestStoreV3Contract.check(offering.identifier == r.getString("offeringIdentifier"))
                val found = offering.availablePackages.filter { it.identifier == r.getString("packageIdentifier") }; TestStoreV3Contract.check(found.size == 1)
                val product = found.single(); verify(product, a)
                TestStoreV3Contract.check(TestStoreV3Contract.date(a.get("acceptPurchaseUntil")) > System.currentTimeMillis())
                persistenceStarted = true
                val handle = policy.reserveAfterLookup(lookup, dispatch, session, fingerprint, document)
                packages[handle] = Prepared(c, a, session, fingerprint, product)
                promise.resolve(mapOf("status" to "prepared", "handleId" to handle, "invocation" to TestStoreV3Contract.map(record.getJSONObject("invocation"))))
              } catch (_: Exception) { if (persistenceStarted) unavailable(promise) else lookupUnavailable() }
            } }
          })
        } catch (_: Exception) { lookupUnavailable() }
      } }
    })
  }
  fun purchase(handle: String, claimJson: String, activity: Activity, promise: Promise) {
    val prepared = requireNotNull(packages[handle]); owns(prepared.customer, prepared.session); verify(prepared.product, prepared.allocation)
    val claim = TestStoreV3Contract.parse(claimJson); TestStoreV3Contract.keys(claim, listOf("protocol", "command", "requestId", "actor", "generation", "environment", "result"))
    val actor = claim.getJSONObject("actor"); val result = claim.getJSONObject("result"); TestStoreV3Contract.id(claim.get("requestId"))
    TestStoreV3Contract.keys(actor, listOf("userId", "sessionId"))
    TestStoreV3Contract.keys(result, listOf("status", "reason", "dispatchAllowed", "retryProviderMutation", "grantsAccess", "notPayable", "customer", "allocation", "reservation", "authorityValidUntil", "receipt"))
    TestStoreV3Contract.check(claim.get("protocol") == "isolated-test-store-v3" && claim.get("command") == "claim" && claim.get("environment") == "sandbox"
      && TestStoreV3Contract.number(claim.get("generation")) == 1L && actor.get("userId") == prepared.customer.get("buyerId") && actor.get("sessionId") == prepared.session
      && result.get("status") == "dispatch_claimed" && result.get("dispatchAllowed") == true && result.get("retryProviderMutation") == false
      && result.get("grantsAccess") == false && result.get("notPayable") == true && result.get("receipt") == JSONObject.NULL
      && TestStoreV3Contract.canonical(result.getJSONObject("customer")) == TestStoreV3Contract.canonical(prepared.customer)
      && TestStoreV3Contract.canonical(result.getJSONObject("allocation")) == TestStoreV3Contract.canonical(prepared.allocation))
    val deadline = TestStoreV3Contract.date(result.get("authorityValidUntil")); val now = System.currentTimeMillis()
    val reservation = result.getJSONObject("reservation"); TestStoreV3Contract.keys(reservation, listOf("revision", "activeAllocationId"))
    TestStoreV3Contract.number(reservation.get("revision")); TestStoreV3Contract.text(result.get("reason"))
    TestStoreV3Contract.check(reservation.get("activeAllocationId") == prepared.allocation.get("id")
      && deadline <= TestStoreV3Contract.date(prepared.allocation.get("acceptPurchaseUntil"))
      && deadline > now && deadline - now <= 5000 && !activity.isFinishing && !activity.isDestroyed)
    val dispatch = prepared.allocation.getString("dispatchId"); val record = TestStoreV3Contract.parse(requireNotNull(policy.read(dispatch)))
    record.getJSONObject("invocation").put("state", "invoking")
    policy.invoke(handle, dispatch, prepared.session, prepared.fingerprint, TestStoreV3Contract.canonical(record)); packages.remove(handle)
    owns(prepared.customer, prepared.session)
    TestStoreV3Contract.check(deadline > System.currentTimeMillis() && TestStoreV3Contract.date(prepared.allocation.get("acceptPurchaseUntil")) > System.currentTimeMillis())
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
        .put("transactionHint", hint ?: JSONObject.NULL).put("completedAt", TestStoreV3Contract.now())
      policy.complete(dispatch, TestStoreV3Contract.canonical(record)); promise.resolve(TestStoreV3Contract.map(invocation))
    } catch (_: Exception) { unavailable(promise) }
  }
  fun read(dispatch: String): Map<String, Any?>? {
    val raw = policy.read(dispatch) ?: return null
    val record = TestStoreV3Contract.parse(raw)
    TestStoreV3Contract.keys(record, listOf("customer", "allocation", "sessionId", "invocation") + if (record.has("preparedClosure")) listOf("preparedClosure") else emptyList())
    val customer = TestStoreV3Contract.customer(record.getJSONObject("customer").toString(), config, policy.installationId())
    val allocation = TestStoreV3Contract.allocation(record.getJSONObject("allocation").toString(), customer)
    TestStoreV3Contract.check(TestStoreV3Contract.canonical(customer) == policy.owner() && allocation.get("dispatchId") == dispatch)
    val invocation = record.getJSONObject("invocation")
    val expected = TestStoreV3Contract.invocation(customer, allocation, TestStoreV3Contract.id(record.get("sessionId")))
    TestStoreV3Contract.keys(invocation, expected.keys().asSequence().toList())
    val state = invocation.get("state"); TestStoreV3Contract.check(state in listOf("prepared", "invoking", "completed", "unknown"))
    if (state == "completed") {
      TestStoreV3Contract.check(invocation.get("outcome") in listOf("sdk_success", "sdk_cancelled", "sdk_failed", "sdk_unknown"))
      if (!invocation.isNull("transactionHint")) TestStoreV3Contract.text(invocation.get("transactionHint"))
      TestStoreV3Contract.date(invocation.get("completedAt"))
    } else TestStoreV3Contract.check(invocation.isNull("outcome") && invocation.isNull("transactionHint") && invocation.isNull("completedAt"))
    listOf("state", "outcome", "transactionHint", "completedAt").forEach { expected.put(it, invocation.get(it)) }
    TestStoreV3Contract.check(TestStoreV3Contract.canonical(expected) == TestStoreV3Contract.canonical(invocation))
    if (record.has("preparedClosure")) {
      TestStoreV3Contract.check(policy.active() != dispatch && !policy.isNativeInvocation(dispatch))
      return TestStoreV3Contract.map(TestStoreV3Contract.validatePreparedClosure(record.getJSONObject("preparedClosure"), invocation))
    }
    if (invocation.get("state") == "invoking" && !policy.isNativeInvocation(dispatch)) invocation.put("state", "unknown")
    return TestStoreV3Contract.map(invocation)
  }
  fun closePrepared(customerJson: String, allocationJson: String, session: String): Map<String, Any?> {
    val customer = TestStoreV3Contract.customer(customerJson, config, policy.installationId())
    val allocation = TestStoreV3Contract.allocation(allocationJson, customer); owns(customer, session)
    val dispatch = allocation.getString("dispatchId")
    val prior = requireNotNull(read(dispatch))
    val raw = requireNotNull(policy.read(dispatch)); val record = TestStoreV3Contract.parse(raw)
    TestStoreV3Contract.check(TestStoreV3Contract.canonical(record.getJSONObject("customer")) == TestStoreV3Contract.canonical(customer)
      && TestStoreV3Contract.canonical(record.getJSONObject("allocation")) == TestStoreV3Contract.canonical(allocation))
    if (record.has("preparedClosure")) return prior
    val invocation = record.getJSONObject("invocation")
    TestStoreV3Contract.check(invocation.get("state") == "prepared")
    record.put("preparedClosure", TestStoreV3Contract.preparedClosure(invocation, TestStoreV3Contract.now()))
    packages.clear() // A failed persistence acknowledgement cannot leave a usable JS handle.
    policy.closePrepared(dispatch, session, raw, TestStoreV3Contract.canonical(record))
    return requireNotNull(read(dispatch))
  }
  fun retire(session: String) { policy.retire(session); packages.clear() }
  private fun unavailable(promise: Promise) { promise.reject("TEST_STORE_V3_NATIVE_UNAVAILABLE", "Native invocation status is unavailable; read retained history.", null) }
}

class ChillywoodTestStoreV3Module : Module() {
  private fun runtime() = TestStoreV3Runtime.current(requireNotNull(appContext.reactContext))
  override fun definition() = ModuleDefinition {
    Name("ChillywoodTestStoreV3")
    Constants {
      val context = appContext.reactContext
      val flavor = context?.packageName == TestStoreV3Policy.APPLICATION_ID || try {
        context?.packageManager?.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)?.metaData?.getBoolean("SCV3_TESTSTORE_FLAVOR", false) == true
      } catch (_: Exception) { false }
      val build = try { context?.let { admitted(it) } } catch (_: Exception) { null }
      mapOf("isolatedTestStoreV3Flavor" to flavor, "build" to build?.plus("nativeDebug" to true))
    }
    AsyncFunction("inspectInstallation") { runtime().inspect() }.runOnQueue(Queues.MAIN)
    AsyncFunction("bindCustomer") { customer: String, session: String -> runtime().bind(customer, session) }.runOnQueue(Queues.MAIN)
    AsyncFunction("preparePackage") { customer: String, allocation: String, session: String, promise: Promise ->
      try { runtime().prepare(customer, allocation, session, promise) } catch (_: Exception) { promise.reject("TEST_STORE_V3_NATIVE_UNAVAILABLE", "Native preparation unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("purchasePrepared") { handle: String, claim: String, promise: Promise ->
      try { runtime().purchase(handle, claim, requireNotNull(appContext.currentActivity), promise) } catch (_: Exception) { promise.reject("TEST_STORE_V3_NATIVE_UNAVAILABLE", "Native invocation status unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readInvocation") { dispatch: String -> runtime().read(dispatch) }.runOnQueue(Queues.MAIN)
    AsyncFunction("closePrepared") { customer: String, allocation: String, session: String -> runtime().closePrepared(customer, allocation, session) }.runOnQueue(Queues.MAIN)
    AsyncFunction("retireSession") { session: String -> runtime().retire(session) }.runOnQueue(Queues.MAIN)
  }
}
