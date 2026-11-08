package expo.modules.chillywoodqualification

import org.json.JSONObject
import org.json.JSONArray
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal object QualificationContract {
  fun check(ok: Boolean) { check(ok) { "QUALIFICATION_NATIVE_UNAVAILABLE" } }
  fun hash(raw: String): String = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
  fun parse(raw: String): JSONObject { check(raw.toByteArray(Charsets.UTF_8).size <= 32000); return JSONObject(raw) }
  fun keys(value: JSONObject, expected: List<String>) { check(value.keys().asSequence().toSet() == expected.toSet()) }
  fun text(value: Any?): String { check(value is String && value.matches(Regex("[A-Za-z0-9_.$:-]{1,160}"))); return value as String }
  fun id(value: Any?): String { val v = text(value); check(v.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))); return v }
  fun number(value: Any?): Long { check(value is Number && value.toDouble().isFinite() && value.toDouble() > 0 && value.toDouble() <= 9007199254740991.0 && value.toLong().toDouble() == value.toDouble()); return (value as Number).toLong() }
  fun now(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
  fun value(v: Any?): Any? = when (v) { JSONObject.NULL -> null; is JSONObject -> map(v); is JSONArray -> (0 until v.length()).map { value(v.get(it)) }; else -> v }
  fun map(v: JSONObject): Map<String, Any?> = v.keys().asSequence().associateWith { value(v.get(it)) }
  fun build(compiledDebug: Boolean, appDebug: Boolean, actualId: String, raw: JSONObject): JSONObject {
    check(compiledDebug && appDebug && actualId == QualificationPolicy.APPLICATION_ID)
    keys(raw, listOf("descriptorJson", "publicSdkKey", "configurationDigest"))
    val descriptor = raw.getString("descriptorJson"); val key = raw.getString("publicSdkKey")
    check(key.matches(Regex("test_[A-Za-z0-9_-]{8,200}")) && hash(descriptor) == raw.getString("configurationDigest"))
    val d = parse(descriptor)
    keys(d, listOf("protocol", "mode", "platform", "applicationId", "runtime", "storageNamespace", "qualificationConnectionId", "qualificationConnectionRevision", "projectId", "appId", "publicSdkKeySha256", "runId", "scenarios"))
    check(d.get("protocol") == "test-store-qualification-build-v1" && d.get("mode") == "record-only-debug" && d.get("platform") == "android"
      && d.get("applicationId") == actualId && d.get("runtime") == "scq-v1-android" && d.get("storageNamespace") == "scq-native-v1" && d.get("publicSdkKeySha256") == hash(key))
    id(d.get("qualificationConnectionId")); number(d.get("qualificationConnectionRevision")); id(d.get("runId")); text(d.get("projectId")); text(d.get("appId"))
    val scenarios = d.getJSONArray("scenarios"); check(scenarios.length() in 1..8); val ids = mutableSetOf<String>()
    for (i in 0 until scenarios.length()) {
      val s = scenarios.getJSONObject(i)
      keys(s, listOf("id", "label", "providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId", "amountMinor", "currency", "intendedAction"))
      check(ids.add(id(s.get("id")))); val label = s.get("label")
      check(label is String && label.length in 1..80 && !label.any { it.code < 32 || it.code == 127 })
      listOf("providerOfferingId", "offeringIdentifier", "providerPackageId", "packageIdentifier", "providerProductId", "productId").forEach { text(s.get(it)) }
      check(number(s.get("amountMinor")) <= 10000 && s.get("currency") == "usd" && s.get("intendedAction") in listOf("purchase", "cancel"))
    }
    return d
  }
}
