package expo.modules.chillywoodproductionpaidvideo

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.revenuecat.purchases.*
import com.revenuecat.purchases.interfaces.GetStoreProductsCallback
import com.revenuecat.purchases.interfaces.PurchaseCallback
import com.revenuecat.purchases.models.StoreProduct
import com.revenuecat.purchases.models.StoreTransaction
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.io.ByteArrayOutputStream
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.security.KeyStore
import java.security.MessageDigest
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private class PaidWitnessRuntime(private val context: Context) {
  companion object {
    private var instance: PaidWitnessRuntime? = null
    fun current(context: Context): PaidWitnessRuntime = instance ?: PaidWitnessRuntime(context.applicationContext).also { instance = it }
  }
  private data class Prepared(val facts: Map<String, String>, val product: StoreProduct,
    val integrity: StandardIntegrityManager.StandardIntegrityTokenProvider, val preparationId: String,
    val monotonicStart: Long, val elapsedLimitMs: Long, val authorization: String)
  private val prepared = mutableMapOf<String, Prepared>()
  private val entryReady = mutableMapOf<String, Prepared>()
  private enum class EntryState { PREPARED, AUTHORIZING, READY, CHECKING, INVOKED }
  private val entryState = mutableMapOf<String, EntryState>()
  private val entryEpoch = mutableMapOf<String, String>()
  private val liveJournalAttempt = mutableSetOf<String>()
  private var owner: String? = null
  private val directory get() = File(context.noBackupFilesDir, "production-paid-video-witness").also { check(it.isDirectory || it.mkdirs()) }
  @Suppress("DEPRECATION") private fun config(): Map<String, String> {
    val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    val metadata = requireNotNull(info.metaData)
    check(metadata.getBoolean("NATIVE_PRODUCTION_PAID_VIDEO_ENABLED", false))
    val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
    val version = if (Build.VERSION.SDK_INT >= 28) pkg.longVersionCode.toString() else pkg.versionCode.toString()
    return mapOf("applicationId" to context.packageName, "nativeBuild" to version,
      "configurationSha256" to requireNotNull(metadata.getString("NATIVE_PRODUCTION_PAID_VIDEO_CONFIGURATION_SHA256")),
      "cloudProjectNumber" to requireNotNull(metadata.getString("NATIVE_PRODUCTION_PAID_VIDEO_INTEGRITY_PROJECT")))
      .also { check(it.getValue("configurationSha256").matches(Regex("[0-9a-f]{64}"))); check(it.getValue("cloudProjectNumber").toLong() > 0) }
  }
  fun status(): Map<String, Any> = try { config().filterKeys { it != "cloudProjectNumber" } + mapOf(
    "protocol" to "native-production-witness-v1", "available" to true, "sdkVersion" to "10.28.1")
  } catch (_: Exception) { mapOf("protocol" to "native-production-witness-v1", "available" to false) }
  fun invalidate() { owner = null; prepared.clear(); entryReady.clear(); entryState.clear(); entryEpoch.clear(); liveJournalAttempt.clear() }
  private fun owns(facts: Map<String, String>, activity: Activity) {
    val config = config()
    check(!activity.isFinishing && !activity.isDestroyed && activity.hasWindowFocus())
    check(Purchases.isConfigured && Purchases.sharedInstance.appUserID == facts["buyerId"] && owner == facts["sessionId"])
    listOf("applicationId", "nativeBuild", "configurationSha256").forEach { check(config[it] == facts[it]) }
    check(facts["sdkVersion"] == "10.28.1")
  }
  private fun file(dispatch: String): AtomicFile { UUID.fromString(dispatch); return AtomicFile(File(directory, "$dispatch.bin")) }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val alias = "chillywood.production.paidvideo.witness.v1"
    val existing = store.getKey(alias, null)
    if (existing != null) return existing as SecretKey
    // A missing key with retained journals is an unknown outcome, not a reset.
    check(directory.listFiles()?.none { it.name.endsWith(".bin") } != false)
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true).build())
    }.generateKey()
  }
  private fun write(dispatch: String, record: JSONObject) {
    val bytes = record.toString().toByteArray(Charsets.UTF_8); check(bytes.size <= 65536)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key())
    cipher.updateAAD(dispatch.toByteArray(Charsets.UTF_8))
    val encrypted = cipher.iv + cipher.doFinal(bytes)
    val file = file(dispatch); val stream = file.startWrite()
    try { stream.write(encrypted); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
  }
  private fun read(dispatch: String): JSONObject {
    val bytes = file(dispatch).readFully(); check(bytes.size in 29..66000)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0,12)))
    cipher.updateAAD(dispatch.toByteArray(Charsets.UTF_8))
    return JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)), Charsets.UTF_8))
  }
  fun prepare(facts: Map<String, String>, authorization: String, activity: Activity, promise: Promise) {
    check(facts.keys == setOf("dispatchId","admissionId","quoteId","challenge","buyerId","sessionId","productId",
      "grossMinor","currency","configurationSha256","applicationId","nativeBuild","sdkVersion","launchBeforeMs"))
    check(facts.values.all { it.isNotEmpty() && it.length <= 512 }); check(facts.getValue("challenge").matches(Regex("[0-9a-f]{64}")))
    UUID.fromString(facts.getValue("buyerId")); UUID.fromString(facts.getValue("sessionId"))
    owner = facts.getValue("sessionId"); owns(facts, activity)
    IntegrityManagerFactory.createStandard(context).prepareIntegrityToken(
      StandardIntegrityManager.PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(config().getValue("cloudProjectNumber").toLong()).build())
      .addOnFailureListener { held(promise) }.addOnSuccessListener { integrity ->
        try {
          owns(facts, activity)
          Purchases.sharedInstance.getProducts(listOf(facts.getValue("productId")), ProductType.INAPP, object: GetStoreProductsCallback {
            override fun onError(error: PurchasesError) { held(promise) }
            override fun onReceived(storeProducts: List<StoreProduct>) {
              try {
                owns(facts, activity); val product = storeProducts.single()
                check(product.id == facts["productId"] && product.price.currencyCode == "USD" && facts["currency"] == "USD")
                val amount=facts.getValue("grossMinor").toLong();check(amount in 1L..999999999L)
                check(product.price.amountMicros == amount * 10000)
                check(facts.getValue("launchBeforeMs").toLong() > System.currentTimeMillis())
                check(!file(facts.getValue("dispatchId")).baseFile.exists())
                val handle = UUID.randomUUID().toString(); val start = SystemClock.elapsedRealtimeNanos()
                val ready = JSONObject(facts).put("state", "prepared").put("preparationId", handle).toString()
                val hash = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(ready.toByteArray(Charsets.UTF_8)),
                  Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
                integrity.request(StandardIntegrityManager.StandardIntegrityTokenRequest.builder().setRequestHash(hash).build())
                  .addOnFailureListener { held(promise) }.addOnSuccessListener { token ->
                    try {
                      owns(facts, activity)
                      val endpoint = requireNotNull(context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
                        .metaData).getString("NATIVE_PRODUCTION_PAID_VIDEO_WITNESS_ENDPOINT")
                      val body = JSONObject().put("action","authorize_launch").put("dispatchId",facts.getValue("dispatchId"))
                        .put("witness",ready).put("integrityToken",token.token()).toString()
                      Thread {
                        try {
                          val grant = launchGrant(requireNotNull(endpoint),authorization,facts.getValue("sessionId"),body)
                          activity.runOnUiThread {
                            try {
                              owns(facts,activity); val limit = grant.getLong("launchElapsedLimitMs")
                              check(grant.getString("status")=="LAUNCH_READY" && grant.getString("dispatchId")==facts["dispatchId"]
                                && grant.getString("preparationId")==handle && limit in 1L..300000L
                                && elapsedMillis(start) in 0 until limit)
                              prepared[handle]=Prepared(facts.toMap(),product,integrity,handle,start,limit,authorization)
                              entryState[handle]=EntryState.PREPARED;promise.resolve(handle)
                            } catch (_: Exception) { held(promise) }
                          }
                        } catch (_: Exception) { activity.runOnUiThread { held(promise) } }
                      }.start()
                    } catch (_: Exception) { held(promise) }
                  }
              } catch (_: Exception) { held(promise) }
            }
          })
        } catch (_: Exception) { held(promise) }
      }
  }
  private fun elapsedMillis(start: Long): Long {
    val elapsed=SystemClock.elapsedRealtimeNanos()-start;check(elapsed>=0 && elapsed<=300000000000L)
    return (elapsed+999999L)/1000000L
  }
  private fun launchGrant(endpoint: String, authorization: String, session: String, body: String): JSONObject {
    val url=URL(endpoint)
    check(url.protocol=="https" && url.host.endsWith(".supabase.co") && url.path=="/functions/v1/native-production-store-witness"
      && url.userInfo==null && url.query==null && url.ref==null && url.port in listOf(-1,443))
    check(authorization.startsWith("Bearer ") && authorization.length<=16384)
    val connection=url.openConnection() as HttpsURLConnection
    try {
      connection.instanceFollowRedirects=false;connection.connectTimeout=15000;connection.readTimeout=15000
      connection.requestMethod="POST";connection.doOutput=true;connection.useCaches=false
      connection.setRequestProperty("Authorization",authorization);connection.setRequestProperty("X-Chillywood-Auth-Session",session)
      connection.setRequestProperty("Content-Type","application/json")
      val bytes=body.toByteArray(Charsets.UTF_8);connection.setFixedLengthStreamingMode(bytes.size)
      connection.outputStream.use { it.write(bytes) };check(connection.responseCode==200)
      val out=ByteArrayOutputStream()
      connection.inputStream.use { input ->
        val buffer=ByteArray(1024)
        while(true){val count=input.read(buffer);if(count<0)break;check(out.size()+count<=8192);out.write(buffer,0,count)}
      }
      return JSONObject(out.toString("UTF-8"))
    } finally { connection.disconnect() }
  }
  fun authorizeEntry(handle: String, activity: Activity, promise: Promise) {
    val value = requireNotNull(prepared[handle]); val facts = value.facts; val dispatch = facts.getValue("dispatchId")
    owns(facts,activity)
    if(entryState[handle]==EntryState.READY){promise.resolve(null);return}
    check(entryState[handle]==EntryState.PREPARED)
    val endpoint = requireNotNull(context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      .metaData).getString("NATIVE_PRODUCTION_PAID_VIDEO_WITNESS_ENDPOINT")
    val body=JSONObject().put("action","authorize_invoke").put("dispatchId",dispatch)
      .put("preparationId",value.preparationId).toString()
    val epoch=UUID.randomUUID().toString();entryEpoch[handle]=epoch;entryState[handle]=EntryState.AUTHORIZING
    fun failAuthorization(){
      if(entryEpoch[handle]==epoch && entryState[handle]==EntryState.AUTHORIZING)entryState[handle]=EntryState.PREPARED
      held(promise)
    }
    Thread {
      try {
        val grant=launchGrant(requireNotNull(endpoint),value.authorization,facts.getValue("sessionId"),body)
        activity.runOnUiThread {
          try {
            owns(facts,activity)
            check(entryEpoch[handle]==epoch && entryState[handle]==EntryState.AUTHORIZING && prepared.containsKey(handle))
            check(grant.getString("status")=="INVOKE_READY" && grant.getString("dispatchId")==dispatch
              && grant.getString("preparationId")==value.preparationId)
            entryReady[handle]=value;entryState[handle]=EntryState.READY;promise.resolve(null)
          } catch (_: Exception) { failAuthorization() }
        }
      } catch (_: Exception) { activity.runOnUiThread { failAuthorization() } }
    }.start()
  }
  fun purchase(handle: String, activity: Activity, promise: Promise) {
    check(entryState[handle]==EntryState.READY)
    val value=requireNotNull(entryReady[handle])
    val epoch=UUID.randomUUID().toString();entryEpoch[handle]=epoch;entryState[handle]=EntryState.CHECKING
    try { invokeClaimed(handle,epoch,value,activity,promise) }
    finally {
      if(entryEpoch[handle]==epoch && entryState[handle]==EntryState.CHECKING)entryState[handle]=EntryState.READY
    }
  }
  private fun invokeClaimed(handle: String, epoch: String, value: Prepared, activity: Activity, promise: Promise) {
    val facts=value.facts; val dispatch=facts.getValue("dispatchId")
    owns(facts, activity); check(facts.getValue("launchBeforeMs").toLong() > System.currentTimeMillis())
    check(liveJournalAttempt.contains(handle) || !file(dispatch).baseFile.exists())
    val record = JSONObject(facts).put("state", "invoking").put("launchedAtMs", System.currentTimeMillis().toString())
      .put("preparationId",value.preparationId)
    liveJournalAttempt.add(handle)
    write(dispatch, record)
    owns(facts, activity); check(facts.getValue("launchBeforeMs").toLong() > System.currentTimeMillis())
    val elapsed=elapsedMillis(value.monotonicStart)
    check(elapsed in 0 until value.elapsedLimitMs);record.put("elapsedToLaunchMs",elapsed.toString())
    val purchases=Purchases.sharedInstance
    val params=PurchaseParams.Builder(activity, value.product).build()
    val callback=object: PurchaseCallback {
      override fun onError(error: PurchasesError, userCancelled: Boolean) { Handler(Looper.getMainLooper()).post {
        try { write(dispatch, record.put("state", if(userCancelled) "cancelled" else "unknown")) } catch (_: Exception) { }
        promise.resolve(mapOf("status" to "unknown", "dispatchId" to dispatch))
      } }
      override fun onCompleted(storeTransaction: StoreTransaction, customerInfo: CustomerInfo) { Handler(Looper.getMainLooper()).post {
        try {
          check(storeTransaction.productIds == listOf(facts.getValue("productId")))
          val transaction = requireNotNull(storeTransaction.orderId); check(transaction.isNotBlank() && transaction.length <= 512)
          check(storeTransaction.purchaseToken.isNotBlank() && storeTransaction.purchaseToken.length <= 8192)
          record.put("state", "completed").put("transactionId", transaction).put("purchaseToken", storeTransaction.purchaseToken)
            .put("completedAtMs", System.currentTimeMillis().toString())
          write(dispatch, record)
          attest(record, value.integrity, promise)
        } catch (_: Exception) { promise.resolve(mapOf("status" to "unknown", "dispatchId" to dispatch)) }
      } }
    }
    check(entryEpoch[handle]==epoch && entryState[handle]==EntryState.CHECKING)
    // No restore after this exact SDK-entry boundary, including synchronous
    // SDK exceptions. Only the live pre-entry stack may return to READY.
    entryState[handle]=EntryState.INVOKED;entryEpoch.remove(handle)
    entryReady.remove(handle);prepared.remove(handle);liveJournalAttempt.remove(handle)
    purchases.purchase(params,callback)
    record.put("elapsedToLaunchMs",elapsedMillis(value.monotonicStart).toString());write(dispatch,record)
  }
  private fun attest(record: JSONObject, integrity: StandardIntegrityManager.StandardIntegrityTokenProvider, promise: Promise) {
    val witness = record.toString()
    val digest = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(witness.toByteArray(Charsets.UTF_8)), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    integrity.request(StandardIntegrityManager.StandardIntegrityTokenRequest.builder().setRequestHash(digest).build())
      .addOnFailureListener { promise.resolve(mapOf("status" to "unknown", "dispatchId" to record.getString("dispatchId"))) }
      .addOnSuccessListener { token -> promise.resolve(mapOf("status" to "witness", "dispatchId" to record.getString("dispatchId"),
        "witness" to witness, "integrityToken" to token.token())) }
  }
  fun recover(dispatch: String, buyer: String, session: String, promise: Promise) {
    val record = read(dispatch); check(record.getString("state") == "completed" && record.getString("buyerId") == buyer
      && record.getString("sessionId") == session && Purchases.isConfigured && Purchases.sharedInstance.appUserID == buyer)
    IntegrityManagerFactory.createStandard(context).prepareIntegrityToken(StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
      .setCloudProjectNumber(config().getValue("cloudProjectNumber").toLong()).build())
      .addOnFailureListener { held(promise) }.addOnSuccessListener { attest(record, it, promise) }
  }
  private fun held(promise: Promise) { promise.reject("purchase_held", "Production purchase is unavailable.", null) }
}
class ChillywoodProductionPaidVideoModule: Module() {
  private fun runtime() = PaidWitnessRuntime.current(requireNotNull(appContext.reactContext))
  override fun definition() = ModuleDefinition {
    Name("ChillywoodProductionPaidVideo")
    Constants { mapOf("available" to (try { runtime().status()["available"] == true } catch (_: Exception) { false })) }
    AsyncFunction("status") { runtime().status() }.runOnQueue(Queues.MAIN)
    AsyncFunction("invalidateOwner") { runtime().invalidate() }.runOnQueue(Queues.MAIN)
    AsyncFunction("prepare") { facts: Map<String,String>, ignoredKeyId: String, authorization: String, promise: Promise ->
      try { check(ignoredKeyId.isEmpty());runtime().prepare(facts, authorization, requireNotNull(appContext.currentActivity), promise) }
      catch (_: Exception) { promise.reject("purchase_held", "Production purchase is unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("purchase") { handle: String, promise: Promise ->
      try { runtime().purchase(handle, requireNotNull(appContext.currentActivity), promise) }
      catch (_: Exception) { promise.reject("purchase_held", "Production purchase is unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("authorizeEntry") { handle: String, promise: Promise ->
      try { runtime().authorizeEntry(handle, requireNotNull(appContext.currentActivity), promise) }
      catch (_: Exception) { promise.reject("purchase_held", "Production purchase is unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("recover") { dispatch: String, buyer: String, session: String, promise: Promise ->
      try { runtime().recover(dispatch, buyer, session, promise) }
      catch (_: Exception) { promise.reject("purchase_held", "Production purchase is unavailable.", null) }
    }.runOnQueue(Queues.MAIN)
  }
}
