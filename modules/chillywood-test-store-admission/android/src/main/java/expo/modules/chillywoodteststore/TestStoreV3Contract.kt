package expo.modules.chillywoodteststore

import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal object TestStoreV3Contract {
  fun check(ok: Boolean) { check(ok) { "TEST_STORE_V3_NATIVE_UNAVAILABLE" } }
  fun parse(raw: String): JSONObject { check(raw.toByteArray(Charsets.UTF_8).size <= 32000); return JSONObject(raw) }
  fun keys(value: JSONObject, names: List<String>) { check(value.keys().asSequence().toSet() == names.toSet()) }
  fun text(value: Any?, max: Int = 200): String {
    check(value is String && value.isNotEmpty() && value.length <= max && value.trim() == value && !value.any { it.code < 32 || it.code == 127 })
    return value as String
  }
  fun id(value: Any?, prefix: String = ""): String { val v = text(value); check(v.startsWith(prefix) && TestStoreV3Policy.uuid(v.removePrefix(prefix))); return v }
  fun number(value: Any?): Long {
    check(value is Number && value.toDouble().isFinite() && value.toDouble() > 0 && value.toDouble() <= 9007199254740991.0 && value.toDouble() == value.toLong().toDouble())
    return (value as Number).toLong()
  }
  fun canonical(value: JSONObject): String = value.keys().asSequence().sorted().joinToString(",", "{", "}") { key ->
    val v = value.get(key)
    val encoded = when (v) { is JSONObject -> canonical(v); is String -> JSONObject.quote(v); is Number -> JSONObject.numberToString(v);
      is Boolean -> v.toString(); JSONObject.NULL -> "null"; else -> error("TEST_STORE_V3_NATIVE_UNAVAILABLE") }
    JSONObject.quote(key) + ":" + encoded
  }
  fun map(value: JSONObject): Map<String, Any?> = value.keys().asSequence().associateWith { key -> val v = value.get(key); when (v) { JSONObject.NULL -> null; is JSONObject -> map(v); else -> v } }
  fun date(value: Any?): Long {
    val v = text(value)
    check(v.matches(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})")))
    // Parse whole seconds plus explicit fractional milliseconds without relying
    // on java.time availability on Android API 24/25.
    val normalized = v.replace(Regex("\\.(\\d{1,6})(?=Z|[+-])")) { "." + it.groupValues[1].padEnd(3, '0').take(3) }
    val format = if (normalized.contains('.')) "yyyy-MM-dd'T'HH:mm:ss.SSSXXX" else "yyyy-MM-dd'T'HH:mm:ssXXX"
    return requireNotNull(SimpleDateFormat(format, Locale.US).apply { isLenient = false; timeZone = TimeZone.getTimeZone("UTC") }.parse(normalized)).time
  }
  fun now(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
  fun build(compiledDebug: Boolean, appDebug: Boolean, actualId: String, c: Map<String, String>): Map<String, String>? {
    if (!compiledDebug || !appDebug || actualId != TestStoreV3Policy.APPLICATION_ID || c.keys != setOf("protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace")
      || c["protocol"] != "isolated-test-store-build-v3" || c["mode"] != "test-store-debug-v3" || c["platform"] != "android"
      || c["applicationId"] != actualId || c["storageNamespace"] != "@chillywood/test-store-debug-v3"
      || c["publicSdkKey"]?.matches(Regex("test_[A-Za-z0-9_-]{8,200}")) != true || c["configId"]?.matches(Regex("[a-f0-9]{64}")) != true
      || c["projectId"]?.matches(Regex("[A-Za-z0-9_-]{4,100}")) != true || c["appId"]?.matches(Regex("[A-Za-z0-9_-]{4,100}")) != true) return null
    return c.toMap()
  }
  fun customer(raw: String, c: Map<String, String>, installationId: String): JSONObject {
    val v = parse(raw); keys(v, listOf("id", "buyerId", "installationId", "providerAppUserId", "configurationDigest", "projectId", "appId", "providerScopeKey", "economicApplicationId", "provider", "store", "sourceEnvironment"))
    id(v.get("id"), "scv3_customer_"); id(v.get("buyerId")); id(v.get("installationId")); val uid = id(v.get("providerAppUserId"), "scv3_teststore_")
    check(uid.matches(Regex("scv3_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
      && v.get("installationId") == installationId && v.get("configurationDigest") == c["configId"] && v.get("projectId") == c["projectId"]
      && v.get("appId") == c["appId"] && v.get("provider") == "revenuecat" && v.get("store") == "TEST_STORE" && v.get("sourceEnvironment") == "SANDBOX")
    val scope = org.json.JSONArray(text(v.get("providerScopeKey"), 500))
    val expected = listOf("revenuecat", c.getValue("projectId"), c.getValue("appId"), "TEST_STORE", "SANDBOX")
    check(scope.length() == expected.size && expected.indices.all { scope.get(it) == expected[it] }
      && v.get("economicApplicationId") == "rc_test_store:" + c.getValue("projectId") + ":" + c.getValue("appId")); return v
  }
  fun allocation(raw: String, c: JSONObject): JSONObject {
    val v = parse(raw); keys(v, listOf("id", "intentId", "dispatchId", "customerBindingId", "configurationDigest", "productId", "quote", "acceptPurchaseUntil", "registration"))
    id(v.get("id"), "scv3_allocation_"); id(v.get("intentId"), "scv1_intent_"); id(v.get("dispatchId"))
    check(v.get("customerBindingId") == c.get("id") && v.get("configurationDigest") == c.get("configurationDigest")); text(v.get("productId")); date(v.get("acceptPurchaseUntil"))
    val q = v.getJSONObject("quote"); keys(q, listOf("offerId", "offerRevision", "resourceId", "resourceRevision", "creatorId", "kind", "amountMinor", "currency", "asset"))
    id(q.get("offerId"), "scv1_offer_"); id(q.get("resourceId"), "scv1_resource_"); id(q.get("creatorId")); number(q.get("offerRevision")); number(q.get("resourceRevision")); number(q.get("amountMinor"))
    check(q.get("kind") == "paid_content" && q.get("currency") == "usd" && q.get("creatorId") != c.get("buyerId"))
    val asset = q.getJSONObject("asset"); keys(asset, listOf("id", "incarnation", "sha256", "byteLength", "resourceRevision", "profile"))
    id(asset.get("id"), "scv1_asset_"); id(asset.get("incarnation"))
    check(text(asset.get("sha256")).matches(Regex("[a-f0-9]{64}")) && number(asset.get("byteLength")) <= 16777216L
      && number(asset.get("resourceRevision")) == number(q.get("resourceRevision")) && asset.get("profile") == "scpv-mp4-h264-aac-v1")
    val r = v.getJSONObject("registration"); keys(r, listOf("id", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId"))
    id(r.get("id"), "scv3_registration_"); listOf("providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId").forEach { text(r.get(it)) }
    check(r.get("productId") == v.get("productId")); return v
  }
  fun invocation(c: JSONObject, a: JSONObject, session: String): JSONObject {
    id(session); return JSONObject().put("protocol", "isolated-test-store-native-v3").put("invocationId", a.get("dispatchId"))
      .put("customerBindingId", c.get("id")).put("installationId", c.get("installationId")).put("buyerId", c.get("buyerId"))
      .put("configurationDigest", c.get("configurationDigest")).put("providerAppUserId", c.get("providerAppUserId"))
      .put("allocationId", a.get("id")).put("registrationId", a.getJSONObject("registration").get("id")).put("sessionId", session).put("quote", a.getJSONObject("quote"))
      .put("state", "prepared").put("outcome", JSONObject.NULL).put("transactionHint", JSONObject.NULL).put("completedAt", JSONObject.NULL)
  }
  fun preparedClosure(invocation: JSONObject, closedAt: String): JSONObject {
    check(invocation.get("state") == "prepared" && invocation.isNull("outcome") && invocation.isNull("transactionHint") && invocation.isNull("completedAt"))
    date(closedAt)
    return JSONObject().put("protocol", "isolated-test-store-native-prepared-closure-v3").put("state", "prepared_closed")
      .put("invocation", invocation).put("closedAt", closedAt)
  }
  fun validatePreparedClosure(value: JSONObject, invocation: JSONObject): JSONObject {
    keys(value, listOf("protocol", "state", "invocation", "closedAt"))
    val expected = preparedClosure(invocation, text(value.get("closedAt")))
    check(canonical(value) == canonical(expected)); return value
  }
}
