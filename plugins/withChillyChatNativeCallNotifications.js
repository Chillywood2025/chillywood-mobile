const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  XML,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "com.chillywood.mobile";
const JAVA_PACKAGE_PATH = PACKAGE_NAME.replace(/\./g, "/");
const TRANSIENT_ACTION_PREFERENCES_FILE = "chilly_chat_native_call_action_v1.xml";
const LEGACY_BACKUP_RESOURCE_NAME = "chillywood_native_call_full_backup_rules";
const MODERN_BACKUP_RESOURCE_NAME = "chillywood_native_call_data_extraction_rules";
const NATIVE_FILES = {
  "ChillyChatIncomingCallDeadline.kt": String.raw`package com.chillywood.mobile

import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Presentation deadline only. Invite acceptance still requires current server authority. */
internal object ChillyChatIncomingCallDeadline {
  // The server currently issues 90-second invites. Permit bounded device clock skew,
  // but never turn missing/invalid payloads into a new locally invented lifetime.
  private const val MAX_SERVER_REMAINDER_MS = 120_000L
  private val SERVER_DATE = Regex(
    "^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2})(?:\\.(\\d{1,9}))?(Z|[+-]\\d{2}:?\\d{2})$",
  )

  data class Deadline(val expiresAtMs: Long, val elapsedDeadlineMs: Long, val remainingMs: Long)

  fun resolve(
    expiresAt: String?,
    nowMs: Long,
    elapsedNowMs: Long,
    previousExpiresAtMs: Long? = null,
    previousElapsedDeadlineMs: Long? = null,
  ): Deadline? {
    val match = SERVER_DATE.matchEntire(expiresAt?.trim().orEmpty()) ?: return null
    val fraction = match.groupValues[2].padEnd(3, '0').take(3)
    val offset = match.groupValues[3].let { if (it == "Z") "+0000" else it.replace(":", "") }
    val normalized = match.groupValues[1] + "." + fraction + offset
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US).apply {
      isLenient = false
      timeZone = TimeZone.getTimeZone("UTC")
    }
    val position = ParsePosition(0)
    val parsed = format.parse(normalized, position) ?: return null
    if (position.index != normalized.length || elapsedNowMs < 0L) return null
    val payloadDeadline = parsed.time
    if (payloadDeadline <= nowMs || payloadDeadline - nowMs > MAX_SERVER_REMAINDER_MS) return null
    val expiresAtMs = previousExpiresAtMs?.let { minOf(it, payloadDeadline) } ?: payloadDeadline
    val remainder = expiresAtMs - nowMs
    if (remainder !in 1..MAX_SERVER_REMAINDER_MS || elapsedNowMs > Long.MAX_VALUE - remainder) return null
    val elapsedDeadlineMs = previousElapsedDeadlineMs?.let { minOf(it, elapsedNowMs + remainder) }
      ?: (elapsedNowMs + remainder)
    val remainingMs = minOf(remainder, elapsedDeadlineMs - elapsedNowMs)
    if (remainingMs <= 0L) return null
    return Deadline(expiresAtMs, elapsedDeadlineMs, remainingMs)
  }
}
`,
  "ChillyChatNativeCallActionStore.kt": String.raw`package com.chillywood.mobile

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import java.security.MessageDigest

object ChillyChatNativeCallActionStore {
  const val SCHEMA_VERSION = 2
  private const val LOG_TAG = "ChillyChatCallAction"
  private const val PREFERENCES_NAME = "chilly_chat_native_call_action_v1"
  private const val KEY_SCHEMA_VERSION = "schema_version"
  private const val KEY_THREAD_ID = "thread_id"
  private const val KEY_CALL_INVITE_ID = "call_invite_id"
  private const val KEY_NATIVE_ACTION = "native_action"
  private const val KEY_REQUEST_KEY = "request_key"
  private const val KEY_CAPTURE_GENERATION = "capture_generation"
  private const val KEY_CAPTURE_GENERATION_COUNTER = "capture_generation_counter"
  private const val KEY_CREATED_AT = "created_at"
  private const val KEY_CREATED_ELAPSED_AT = "created_elapsed_at"
  private const val KEY_LAST_CONSUMED_REQUEST_KEY = "last_consumed_request_key"
  private const val KEY_LAST_CONSUMED_ELAPSED_AT = "last_consumed_elapsed_at"
  private const val MAX_ACTION_AGE_MS = 45_000L
  private const val MAX_SAFE_JS_INTEGER = 9_007_199_254_740_991L
  private val UUID_PATTERN = Regex(
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
  )
  private val REQUEST_KEY_PATTERN = Regex("^[0-9a-f]{64}$")

  data class PendingAction(
    val threadId: String,
    val callInviteId: String,
    val nativeCallAction: String,
    val requestKey: String,
    val captureGeneration: Long,
    val createdAt: Long,
    val schemaVersion: Int,
  )

  @Synchronized
  fun captureTrustedNotificationAction(
    context: Context,
    threadIdInput: String?,
    inviteIdInput: String?,
    nativeActionInput: String?,
  ): Boolean {
    val threadId = normalizeUuid(threadIdInput) ?: return false
    val inviteId = normalizeUuid(inviteIdInput) ?: return false
    val nativeAction = normalizeAction(nativeActionInput) ?: return false
    Log.i(LOG_TAG, "ACTION_CAPTURED")

    val requestKey = sha256("$threadId:$inviteId:$nativeAction")
    val preferences = preferences(context)
    val elapsedAt = SystemClock.elapsedRealtime()
    val storedSchemaVersion = preferences.getInt(KEY_SCHEMA_VERSION, 0)
    if (
      storedSchemaVersion != SCHEMA_VERSION
      && (storedSchemaVersion != 0 || preferences.all.isNotEmpty())
    ) {
      preferences.edit().clear().commit()
    }
    val existingRequestKey = preferences.getString(KEY_REQUEST_KEY, null).orEmpty()
    val existingElapsedAt = preferences.getLong(KEY_CREATED_ELAPSED_AT, 0L)
    if (
      preferences.getInt(KEY_SCHEMA_VERSION, 0) == SCHEMA_VERSION
      && isFresh(existingElapsedAt, elapsedAt)
    ) {
      if (existingRequestKey == requestKey) {
        Log.i(LOG_TAG, "ACTION_BUFFERED")
        return true
      }
      Log.i(LOG_TAG, "ACTION_REPLAY_DENIED")
      return false
    }
    val lastConsumedRequestKey =
      preferences.getString(KEY_LAST_CONSUMED_REQUEST_KEY, null).orEmpty()
    val lastConsumedElapsedAt = preferences.getLong(KEY_LAST_CONSUMED_ELAPSED_AT, 0L)
    if (
      lastConsumedRequestKey == requestKey
      && isFresh(lastConsumedElapsedAt, elapsedAt)
    ) {
      Log.i(LOG_TAG, "ACTION_REPLAY_DENIED")
      return false
    }

    val previousCaptureGeneration = preferences.getLong(KEY_CAPTURE_GENERATION_COUNTER, 0L)
    val captureGeneration = if (
      previousCaptureGeneration in 1 until MAX_SAFE_JS_INTEGER
    ) previousCaptureGeneration + 1L else 1L
    val editor = preferences.edit()
    if (!isFresh(lastConsumedElapsedAt, elapsedAt)) {
      editor
        .remove(KEY_LAST_CONSUMED_REQUEST_KEY)
        .remove(KEY_LAST_CONSUMED_ELAPSED_AT)
    }
    val persisted = editor
      .putInt(KEY_SCHEMA_VERSION, SCHEMA_VERSION)
      .putString(KEY_THREAD_ID, threadId)
      .putString(KEY_CALL_INVITE_ID, inviteId)
      .putString(KEY_NATIVE_ACTION, nativeAction)
      .putString(KEY_REQUEST_KEY, requestKey)
      .putLong(KEY_CAPTURE_GENERATION, captureGeneration)
      .putLong(KEY_CAPTURE_GENERATION_COUNTER, captureGeneration)
      .putLong(KEY_CREATED_AT, System.currentTimeMillis())
      .putLong(KEY_CREATED_ELAPSED_AT, elapsedAt)
      .commit()
    if (persisted) Log.i(LOG_TAG, "ACTION_BUFFERED")
    return persisted
  }

  @Synchronized
  fun consume(context: Context): PendingAction? {
    val preferences = preferences(context)
    val schemaVersion = preferences.getInt(KEY_SCHEMA_VERSION, 0)
    if (schemaVersion != SCHEMA_VERSION) {
      if (preferences.all.isNotEmpty()) preferences.edit().clear().commit()
      return null
    }
    val threadId = normalizeUuid(preferences.getString(KEY_THREAD_ID, null))
    val inviteId = normalizeUuid(preferences.getString(KEY_CALL_INVITE_ID, null))
    val nativeAction = normalizeAction(preferences.getString(KEY_NATIVE_ACTION, null))
    val requestKey = preferences.getString(KEY_REQUEST_KEY, null).orEmpty()
    val captureGeneration = preferences.getLong(KEY_CAPTURE_GENERATION, 0L)
    val createdAt = preferences.getLong(KEY_CREATED_AT, 0L)
    val createdElapsedAt = preferences.getLong(KEY_CREATED_ELAPSED_AT, 0L)
    val elapsedAt = SystemClock.elapsedRealtime()
    val expectedRequestKey = if (
      threadId != null && inviteId != null && nativeAction != null
    ) {
      sha256("$threadId:$inviteId:$nativeAction")
    } else {
      ""
    }
    val valid = schemaVersion == SCHEMA_VERSION
      && requestKey.matches(REQUEST_KEY_PATTERN)
      && requestKey == expectedRequestKey
      && captureGeneration in 1..MAX_SAFE_JS_INTEGER
      && createdAt > 0L
      && isFresh(createdElapsedAt, elapsedAt)

    val editor = removePending(preferences.edit())
    if (valid) {
      editor
        .putString(KEY_LAST_CONSUMED_REQUEST_KEY, requestKey)
        .putLong(KEY_LAST_CONSUMED_ELAPSED_AT, elapsedAt)
    }
    editor.commit()
    if (
      !valid
      || threadId == null
      || inviteId == null
      || nativeAction == null
    ) {
      if (createdElapsedAt > 0L && !isFresh(createdElapsedAt, elapsedAt)) {
        Log.i(LOG_TAG, "ACTION_EXPIRED")
      }
      return null
    }
    Log.i(LOG_TAG, "ACTION_CONSUMED")
    return PendingAction(
      threadId,
      inviteId,
      nativeAction,
      requestKey,
      captureGeneration,
      createdAt,
      schemaVersion,
    )
  }

  @Synchronized
  fun readStatus(context: Context): String {
    val preferences = preferences(context)
    val schemaVersion = preferences.getInt(KEY_SCHEMA_VERSION, 0)
    if (schemaVersion != SCHEMA_VERSION && preferences.all.isNotEmpty()) {
      preferences.edit().clear().commit()
      return "expired"
    }
    val elapsedAt = SystemClock.elapsedRealtime()
    if (!preferences.contains(KEY_REQUEST_KEY)) {
      val lastConsumedElapsedAt =
        preferences.getLong(KEY_LAST_CONSUMED_ELAPSED_AT, 0L)
      if (!isFresh(lastConsumedElapsedAt, elapsedAt)) {
        preferences.edit()
          .remove(KEY_LAST_CONSUMED_REQUEST_KEY)
          .remove(KEY_LAST_CONSUMED_ELAPSED_AT)
          .commit()
      }
      return "empty"
    }
    val createdElapsedAt = preferences.getLong(KEY_CREATED_ELAPSED_AT, 0L)
    if (
      preferences.getInt(KEY_SCHEMA_VERSION, 0) != SCHEMA_VERSION
      || !isFresh(createdElapsedAt, elapsedAt)
    ) {
      removePending(preferences.edit()).commit()
      return "expired"
    }
    return "present"
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  private fun normalizeUuid(value: String?): String? {
    val normalized = value?.trim().orEmpty()
    return if (UUID_PATTERN.matches(normalized)) normalized.lowercase() else null
  }

  private fun normalizeAction(value: String?): String? {
    val normalized = value?.trim()?.lowercase().orEmpty()
    return normalized.takeIf { it == "answer" || it == "decline" }
  }

  private fun isFresh(createdElapsedAt: Long, currentElapsedAt: Long): Boolean {
    val ageMs = currentElapsedAt - createdElapsedAt
    return createdElapsedAt > 0L && ageMs in 0..MAX_ACTION_AGE_MS
  }

  private fun removePending(editor: SharedPreferences.Editor): SharedPreferences.Editor =
    editor
      .remove(KEY_THREAD_ID)
      .remove(KEY_CALL_INVITE_ID)
      .remove(KEY_NATIVE_ACTION)
      .remove(KEY_REQUEST_KEY)
      .remove(KEY_CAPTURE_GENERATION)
      .remove(KEY_CREATED_AT)
      .remove(KEY_CREATED_ELAPSED_AT)

  private fun sha256(value: String): String =
    MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8))
      .joinToString("") { byte ->
        (byte.toInt() and 0xff).toString(16).padStart(2, '0')
      }
}
`,
  "ChillyChatCallNotifications.kt": String.raw`package com.chillywood.mobile

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import java.util.UUID

object ChillyChatCallNotifications {
  const val CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"
  const val ACTION_ANSWER = "com.chillywood.mobile.action.ANSWER_CHILLY_CHAT_CALL"
  const val ACTION_DECLINE = "com.chillywood.mobile.action.DECLINE_CHILLY_CHAT_CALL"
  const val ACTION_EXPIRE = "com.chillywood.mobile.action.EXPIRE_CHILLY_CHAT_CALL"
  private const val NOTIFICATION_ID_BASE = 770000
  private const val EXTRA_INVITE_DEADLINE = "chillywood.invite.expiresAtMs"
  private const val EXTRA_ELAPSED_DEADLINE = "chillywood.invite.elapsedDeadlineMs"
  private const val EXTRA_THREAD_SCOPE = "chillywood.invite.threadId"
  private const val EXTRA_PRESENTATION_NONCE = "chillywood.invite.presentationNonce"
  private const val EXTRA_CALL_TYPE = "chillywood.invite.callType"
  private val PRESENTATION_UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
  private val RING_VIBRATION_PATTERN = longArrayOf(0, 480, 220, 480, 220, 720)
  private val presentationObservers = mutableSetOf<(String, String?) -> Unit>()

  data class IncomingPresentation(
    val inviteId: String,
    val threadId: String,
    val nonce: String,
    val expiresAtMs: Long,
    val elapsedDeadlineMs: Long,
    val callType: String,
  )

  // Only a currently posted, app-owned notification grants presentation. Intent
  // extras alone never grant an Answer/Decline action or server/media authority.
  @Synchronized
  fun readIncomingPresentation(context: Context, intent: Intent): IncomingPresentation? {
    val inviteId = intent.getStringExtra("callInviteId") ?: return null
    val threadId = intent.getStringExtra("threadId") ?: return null
    val nonce = intent.getStringExtra(EXTRA_PRESENTATION_NONCE) ?: return null
    if (!PRESENTATION_UUID.matches(inviteId) || !PRESENTATION_UUID.matches(threadId) || !PRESENTATION_UUID.matches(nonce)) return null
    val extras = context.getSystemService(NotificationManager::class.java).activeNotifications
      .firstOrNull { it.tag == notificationTagForInvite(inviteId) && it.id == notificationIdForInvite(inviteId) }
      ?.notification?.extras ?: return null
    if (extras.getString(EXTRA_THREAD_SCOPE) != threadId
      || extras.getString(EXTRA_PRESENTATION_NONCE) != nonce || nonce.isBlank()) return null
    val expiresAt = extras.getLong(EXTRA_INVITE_DEADLINE, 0L)
    val elapsedDeadline = extras.getLong(EXTRA_ELAPSED_DEADLINE, 0L)
    if (expiresAt - System.currentTimeMillis() !in 1..120_000L
      || elapsedDeadline - SystemClock.elapsedRealtime() !in 1..120_000L) return null
    val callType = extras.getString(EXTRA_CALL_TYPE)
    if (callType != "voice" && callType != "video") return null
    return IncomingPresentation(inviteId, threadId, nonce, expiresAt, elapsedDeadline, callType)
  }

  @Synchronized
  fun observeIncomingPresentation(observer: (String, String?) -> Unit): () -> Unit {
    presentationObservers.add(observer)
    return { synchronized(this) { presentationObservers.remove(observer) }; Unit }
  }

  @Synchronized
  fun performIncomingPresentationAction(
    context: Context,
    intent: Intent,
    expected: IncomingPresentation,
    action: String,
  ): Boolean {
    if (action !in setOf("answer", "decline") || readIncomingPresentation(context, intent) != expected) return false
    launchAfterTrustedAction(context, expected.inviteId, expected.threadId, action)
    return true
  }

  fun shouldHandleNativeIncomingCall(data: Map<String, String>): Boolean {
    val triggerType = data["triggerType"].orEmpty()
    val callStyle = data["nativeCallStyle"].orEmpty()
    val openCall = data["openCall"].orEmpty()
    val inviteId = data["callInviteId"].orEmpty()
    val threadId = data["threadId"].orEmpty()
    return inviteId.isNotBlank()
      && threadId.isNotBlank()
      && (
        callStyle == "android_callstyle"
          || callStyle == "1"
          || (triggerType == "incoming_chilly_chat_voice_video_call" && openCall == "true")
      )
  }

  fun isAppForegrounded(): Boolean =
    ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

  @Synchronized
  fun handleNativeTerminalCall(context: Context, data: Map<String, String>): Boolean {
    if (data["nativeCallStyle"] != "terminal" || data["dismissCall"] != "true"
      || data["action"] !in setOf("cancel", "declined", "end", "timeout")) return false
    val inviteId = data["callInviteId"].orEmpty()
    val threadId = data["threadId"].orEmpty()
    if (inviteId.isBlank() || threadId.isBlank()) return true
    val posted = context.getSystemService(NotificationManager::class.java).activeNotifications
      .firstOrNull { it.tag == notificationTagForInvite(inviteId) && it.id == notificationIdForInvite(inviteId) }
      ?: return true
    // A terminal push only retires its existing presentation. It cannot clear
    // another invite/thread, create a user action, consume pending authority,
    // or bring the app to the foreground.
    if (posted.notification.extras.getString(EXTRA_THREAD_SCOPE) == threadId) {
      clearIncomingCallNotification(context, inviteId)
    }
    return true
  }

  fun ensureCallChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: Settings.System.DEFAULT_NOTIFICATION_URI
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      CALL_CHANNEL_ID,
      "Chi'lly Chat incoming calls",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Incoming Chi'lly Chat voice and video calls."
      enableVibration(true)
      vibrationPattern = RING_VIBRATION_PATTERN
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setSound(ringtoneUri, audioAttributes)
    }
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val notificationManager = context.getSystemService(NotificationManager::class.java)
    return notificationManager.canUseFullScreenIntent()
  }

  fun canOpenFullScreenIntentSettings(): Boolean = Build.VERSION.SDK_INT >= 34

  fun buildFullScreenIntentSettingsIntent(context: Context): Intent {
    val packageUri = Uri.parse("package:" + context.packageName)
    return if (Build.VERSION.SDK_INT >= 34) {
      Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, packageUri)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }

  @Synchronized
  fun showIncomingCallNotification(context: Context, data: Map<String, String>) {
    val inviteId = data["callInviteId"].orEmpty()
    val threadId = data["threadId"].orEmpty()
    if (inviteId.isBlank() || threadId.isBlank()) return
    val notificationManager = context.getSystemService(NotificationManager::class.java)
    val previous = notificationManager.activeNotifications
      .firstOrNull { it.tag == notificationTagForInvite(inviteId) && it.id == notificationIdForInvite(inviteId) }?.notification?.extras
    if (previous?.containsKey(EXTRA_THREAD_SCOPE) == true && previous.getString(EXTRA_THREAD_SCOPE) != threadId) return
    // Keep the first deadline even when the same FCM payload is redelivered or the
    // process restarts. Elapsed time prevents a wall-clock adjustment extending it.
    val deadline = ChillyChatIncomingCallDeadline.resolve(
      data["expiresAt"],
      System.currentTimeMillis(),
      SystemClock.elapsedRealtime(),
      previous?.takeIf { it.containsKey(EXTRA_INVITE_DEADLINE) }?.getLong(EXTRA_INVITE_DEADLINE),
      previous?.takeIf { it.containsKey(EXTRA_ELAPSED_DEADLINE) }?.getLong(EXTRA_ELAPSED_DEADLINE),
    ) ?: run {
      clearIncomingCallNotification(context, inviteId)
      return
    }
    ensureCallChannel(context)

    val callType = data["callType"].orEmpty().ifBlank { "voice" }
    val callerName = data["callerName"].orEmpty().ifBlank { "Someone" }
    val resolvedCallType = if (callType == "video") "video" else "voice"
    val title = data["title"].orEmpty().ifBlank {
      "Incoming Chi'lly Chat " + resolvedCallType + " call"
    }
    val body = data["body"].orEmpty().ifBlank {
      "$callerName is calling you on Chi'lly Chat."
    }

    val contentIntent = buildNavigationPendingIntent(context, data, 0)
    val answerIntent = buildActionPendingIntent(context, data, ACTION_ANSWER, 1)
    val declineIntent = buildActionPendingIntent(context, data, ACTION_DECLINE, 2)
    val presentationNonce = previous?.getString(EXTRA_PRESENTATION_NONCE)
      ?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
    val fullScreenIntent = buildIncomingPresentationPendingIntent(context, data, presentationNonce)
    val caller = Person.Builder()
      .setName(callerName)
      .setImportant(true)
      .build()

    val callStyle = NotificationCompat.CallStyle.forIncomingCall(
      caller,
      declineIntent,
      answerIntent,
    )
      .setIsVideo(resolvedCallType == "video")
    val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setTimeoutAfter(deadline.remainingMs)
      .addExtras(Bundle().apply {
        putLong(EXTRA_INVITE_DEADLINE, deadline.expiresAtMs)
        putLong(EXTRA_ELAPSED_DEADLINE, deadline.elapsedDeadlineMs)
        putString(EXTRA_THREAD_SCOPE, threadId)
        putString(EXTRA_PRESENTATION_NONCE, presentationNonce)
        putString(EXTRA_CALL_TYPE, resolvedCallType)
      })
      .setContentIntent(contentIntent)
      // Android sends deleteIntent on automatic timeout too. Only the explicit
      // CallStyle Decline button may create a Decline action and launch the app.
      .setFullScreenIntent(fullScreenIntent, canUseFullScreenIntent(context))
      .setStyle(callStyle)
      .build()
      .apply {
        flags = flags or Notification.FLAG_INSISTENT
      }

    if (
      Build.VERSION.SDK_INT < 33
      || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      NotificationManagerCompat.from(context).notify(notificationTagForInvite(inviteId), notificationIdForInvite(inviteId), notification)
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        // Notification timeoutAfter is a no-op before Android 8. These supported
        // Android 7 versions permit exact idle alarms without the later permission.
        val expirationIntent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
          action = ACTION_EXPIRE
          this.data = buildActionIdentity(inviteId, ACTION_EXPIRE)
          putExtra("callInviteId", inviteId)
          putExtra(EXTRA_INVITE_DEADLINE, deadline.expiresAtMs)
        }
        val expiration = PendingIntent.getBroadcast(
          context, notificationIdForInvite(inviteId) + 5, expirationIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        context.getSystemService(AlarmManager::class.java).setExactAndAllowWhileIdle(
          AlarmManager.ELAPSED_REALTIME_WAKEUP, deadline.elapsedDeadlineMs, expiration,
        )
      }
    }
  }

  @Synchronized
  fun clearIncomingCallNotification(context: Context, inviteId: String?) {
    if (inviteId.isNullOrBlank()) return
    val nonce = context.getSystemService(NotificationManager::class.java).activeNotifications
      .firstOrNull { it.tag == notificationTagForInvite(inviteId) && it.id == notificationIdForInvite(inviteId) }
      ?.notification?.extras?.getString(EXTRA_PRESENTATION_NONCE)
    NotificationManagerCompat.from(context).cancel(notificationTagForInvite(inviteId), notificationIdForInvite(inviteId))
    val observers = presentationObservers.toList()
    Handler(Looper.getMainLooper()).post { observers.forEach { it(inviteId, nonce) } }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      val intent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
        action = ACTION_EXPIRE
        data = buildActionIdentity(inviteId, ACTION_EXPIRE)
      }
      val expiration = PendingIntent.getBroadcast(
        context, notificationIdForInvite(inviteId) + 5, intent,
        PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
      )
      if (expiration != null) {
        context.getSystemService(AlarmManager::class.java).cancel(expiration)
        expiration.cancel()
      }
    }
  }

  @Synchronized
  fun expireIncomingCallNotification(context: Context, intent: Intent) {
    val inviteId = intent.getStringExtra("callInviteId") ?: return
    val previous = context.getSystemService(NotificationManager::class.java).activeNotifications
      .firstOrNull { it.tag == notificationTagForInvite(inviteId) && it.id == notificationIdForInvite(inviteId) }?.notification?.extras ?: return
    // An old alarm cannot dismiss a different presentation. This only removes
    // native UI; it does not synthesize Answer/Decline or change server status.
    val expiresAt = previous.getLong(EXTRA_INVITE_DEADLINE, 0L)
    val elapsedDeadline = previous.getLong(EXTRA_ELAPSED_DEADLINE, 0L)
    if (expiresAt > 0L && expiresAt == intent.getLongExtra(EXTRA_INVITE_DEADLINE, -1L)
      && (expiresAt <= System.currentTimeMillis() || elapsedDeadline in 1..SystemClock.elapsedRealtime())) {
      clearIncomingCallNotification(context, inviteId)
    }
  }

  private fun buildIncomingPresentationPendingIntent(
    context: Context,
    data: Map<String, String>,
    nonce: String,
  ): PendingIntent {
    val inviteId = data["callInviteId"].orEmpty()
    val intent = Intent(context, ChillyChatIncomingCallActivity::class.java).apply {
      this.data = Uri.Builder().scheme("chillywoodinternal").authority("incoming-call")
        .appendPath(inviteId).appendPath(nonce).build()
      putExtra("callInviteId", inviteId)
      putExtra("threadId", data["threadId"])
      putExtra(EXTRA_PRESENTATION_NONCE, nonce)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(context, notificationIdForInvite(inviteId) + 3, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun buildNavigationPendingIntent(
    context: Context,
    data: Map<String, String>,
    requestOffset: Int,
  ): PendingIntent {
    val deepLink = buildNavigationDeepLink(data)
    val launchComponent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.component
    val intent = Intent(Intent.ACTION_VIEW, deepLink).apply {
      if (launchComponent != null) {
        component = launchComponent
      } else {
        setPackage(context.packageName)
      }
      addCategory(Intent.CATEGORY_DEFAULT)
      addCategory(Intent.CATEGORY_BROWSABLE)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      context,
      notificationIdForInvite(data["callInviteId"].orEmpty()) + requestOffset,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildActionPendingIntent(
    context: Context,
    data: Map<String, String>,
    action: String,
    requestOffset: Int,
  ): PendingIntent {
    val intent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      this.action = action
      this.data = buildActionIdentity(data["callInviteId"].orEmpty(), action)
      putExtra("callInviteId", data["callInviteId"])
      putExtra("threadId", data["threadId"])
      putExtra("callType", data["callType"])
      putExtra("callerName", data["callerName"])
    }
    return PendingIntent.getBroadcast(
      context,
      notificationIdForInvite(data["callInviteId"].orEmpty()) + requestOffset,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun buildNavigationDeepLink(data: Map<String, String>): Uri {
    val threadId = data["threadId"].orEmpty()
    return Uri.Builder()
      .scheme("chillywoodmobile")
      .authority("chat")
      .appendPath(threadId)
      .build()
  }

  private fun notificationIdForInvite(inviteId: String): Int =
    NOTIFICATION_ID_BASE + (inviteId.hashCode() and 0x0FFFFFFF)

  private fun notificationTagForInvite(inviteId: String): String = "chilly_chat_call:" + inviteId

  private fun buildActionIdentity(inviteId: String, action: String): Uri = Uri.Builder()
    .scheme("chillywoodinternal")
    .authority("call-action")
    .appendPath(inviteId)
    .appendPath(action)
    .build()

  fun launchAfterTrustedAction(context: Context, inviteId: String?, threadId: String?, nativeAction: String) {
    if (!ChillyChatNativeCallActionStore.captureTrustedNotificationAction(
      context,
      threadId,
      inviteId,
      nativeAction,
    )) return
    val launchComponent = context.packageManager
      .getLaunchIntentForPackage(context.packageName)
      ?.component
      ?: return
    val intent = Intent(Intent.ACTION_MAIN).apply {
      component = launchComponent
      setPackage(context.packageName)
      data = null
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    clearIncomingCallNotification(context, inviteId)
    context.startActivity(intent)
  }
}
`,
  "ChillyChatIncomingCallActivity.kt": String.raw`package com.chillywood.mobile

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** A private, call-only surface. The ordinary app never gains lock-screen visibility. */
class ChillyChatIncomingCallActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private var presentation: ChillyChatCallNotifications.IncomingPresentation? = null
  private var presentationIntent: Intent? = null
  private var unsubscribe: (() -> Unit)? = null
  private var actionGeneration = 0L
  private var pendingAction: String? = null
  private data class CredentialAttempt(
    val requestCode: Int,
    val presentation: ChillyChatCallNotifications.IncomingPresentation,
    val generation: Long,
    val action: String,
  )
  private var credentialAttempt: CredentialAttempt? = null
  private var nextCredentialRequestCode = 4101
  private var legacyCredentialRequestsAllowed = true
  private var answer: Button? = null
  private var decline: Button? = null
  private val checkPresentation = object : Runnable {
    override fun run() {
      if (ownsPresentation()) handler.postDelayed(this, 500L) else finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Android 7 reports credentials by a numeric request code. After recreation
    // an old result may still arrive: require manual unlock and a fresh tap,
    // instead of reusing codes or restoring a pending action as authority.
    legacyCredentialRequestsAllowed = savedInstanceState == null
    unsubscribe = ChillyChatCallNotifications.observeIncomingPresentation { inviteId, nonce ->
      val current = presentation
      if (current != null && current.inviteId == inviteId && current.nonce == nonce) finish()
    }
    bindPresentation(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    bindPresentation(intent)
  }

  private fun bindPresentation(intent: Intent) {
    val incoming = ChillyChatCallNotifications.readIncomingPresentation(this, intent)
    if (incoming == null) {
      // A stale notification tap must not replace or dismiss a newer live call.
      if (!ownsPresentation()) finish()
      return
    }
    actionGeneration += 1L
    pendingAction = null
    credentialAttempt = null
    handler.removeCallbacks(checkPresentation)
    setIntent(intent)
    presentationIntent = Intent(intent)
    presentation = incoming
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    // Never render notification caller text, a chat route, or media on this surface.
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(32, 48, 32, 48)
      setBackgroundColor(Color.rgb(22, 22, 28))
    }
    layout.addView(TextView(this).apply {
      text = if (presentation?.callType == "video") "Incoming Chi'lly Chat video call" else "Incoming Chi'lly Chat voice call"
      textSize = 24f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
    })
    layout.addView(TextView(this).apply {
      text = "Unlock to answer or decline"
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
    })
    answer = Button(this).apply { text = "Answer"; setOnClickListener { requestAction("answer") } }
    decline = Button(this).apply { text = "Decline"; setOnClickListener { requestAction("decline") } }
    layout.addView(answer)
    layout.addView(decline)
    setContentView(layout)
    handler.post(checkPresentation)
  }

  private fun ownsPresentation(): Boolean {
    val expected = presentation ?: return false
    val ownedIntent = presentationIntent ?: return false
    return !isFinishing && !isDestroyed
      && ChillyChatCallNotifications.readIncomingPresentation(this, ownedIntent) == expected
  }

  private fun requestAction(action: String) {
    if (pendingAction != null || !ownsPresentation()) return
    val expected = presentation ?: return
    val generation = ++actionGeneration
    pendingAction = action
    answer?.isEnabled = false
    decline?.isEnabled = false
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (!keyguard.isKeyguardLocked) {
      completeAction(expected, generation, action)
    } else if (Build.VERSION.SDK_INT >= 26) {
      try {
        keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() { completeAction(expected, generation, action) }
          override fun onDismissCancelled() { releaseAction(expected, generation) }
          override fun onDismissError() { releaseAction(expected, generation) }
        })
      } catch (_: RuntimeException) { releaseAction(expected, generation) }
    } else {
      // Older supported phones use the normal OS credential UI. A non-secure
      // keyguard must be unlocked by its owner; no legacy bypass flags are used.
      @Suppress("DEPRECATION")
      val unlock = keyguard.createConfirmDeviceCredentialIntent("Chi'lly Chat", "Unlock to answer or decline")
      if (legacyCredentialRequestsAllowed && unlock != null && nextCredentialRequestCode <= 65535) {
        val requestCode = nextCredentialRequestCode++
        credentialAttempt = CredentialAttempt(requestCode, expected, generation, action)
        try { startActivityForResult(unlock, requestCode) }
        catch (_: RuntimeException) { releaseAction(expected, generation) }
      } else releaseAction(expected, generation)
    }
  }

  private fun completeAction(expected: ChillyChatCallNotifications.IncomingPresentation, generation: Long, action: String) {
    if (presentation != expected || generation != actionGeneration || pendingAction != action || !ownsPresentation()) return
    if (getSystemService(KeyguardManager::class.java).isKeyguardLocked) { releaseAction(expected, generation); return }
    val ownedIntent = presentationIntent ?: return
    // Re-read the exact presentation after the asynchronous OS credential UI.
    // The established action store and JS/server checks still own acceptance.
    ChillyChatCallNotifications.performIncomingPresentationAction(this, ownedIntent, expected, action)
    finish()
  }

  private fun releaseAction(expected: ChillyChatCallNotifications.IncomingPresentation, generation: Long) {
    if (presentation != expected || generation != actionGeneration || !ownsPresentation()) return
    pendingAction = null
    credentialAttempt = null
    answer?.isEnabled = true
    decline?.isEnabled = true
  }

  @Deprecated("Legacy credential result for Android 7")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    val attempt = credentialAttempt?.takeIf { it.requestCode == requestCode } ?: return
    credentialAttempt = null
    if (resultCode == RESULT_OK) completeAction(attempt.presentation, attempt.generation, attempt.action)
    else releaseAction(attempt.presentation, attempt.generation)
  }

  override fun onResume() {
    super.onResume()
    if (!ownsPresentation()) finish()
  }

  override fun onDestroy() {
    actionGeneration += 1L
    pendingAction = null
    credentialAttempt = null
    presentation = null
    presentationIntent = null
    handler.removeCallbacks(checkPresentation)
    unsubscribe?.invoke()
    unsubscribe = null
    super.onDestroy()
  }
}
`,
  "ChillyChatFirebaseMessagingService.kt": String.raw`package com.chillywood.mobile

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class ChillyChatFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (ChillyChatCallNotifications.handleNativeTerminalCall(this, data)) return
    if (ChillyChatCallNotifications.shouldHandleNativeIncomingCall(data)) {
      if (!ChillyChatCallNotifications.isAppForegrounded()) {
        ChillyChatCallNotifications.showIncomingCallNotification(this, data)
      }
      return
    }

    super.onMessageReceived(remoteMessage)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
  }
}
`,
  "ChillyChatCallNotificationActionReceiver.kt": String.raw`package com.chillywood.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ChillyChatCallNotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ChillyChatCallNotifications.ACTION_EXPIRE) {
      ChillyChatCallNotifications.expireIncomingCallNotification(context, intent)
      return
    }
    val inviteId = intent.getStringExtra("callInviteId")
    val threadId = intent.getStringExtra("threadId")
    val nativeAction = when (intent.action) {
      ChillyChatCallNotifications.ACTION_ANSWER -> "answer"
      ChillyChatCallNotifications.ACTION_DECLINE -> "decline"
      else -> return
    }

    ChillyChatCallNotifications.launchAfterTrustedAction(context, inviteId, threadId, nativeAction)
  }
}
`,
  "ChillyChatCallNotificationModule.kt": String.raw`package com.chillywood.mobile

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class ChillyChatCallNotificationModule(
  private val reactContext: ReactApplicationContext,
  private val pendingActionEmitter: () -> Unit = {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_PENDING_ACTION_AVAILABLE, null)
  },
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  companion object {
    const val EVENT_PENDING_ACTION_AVAILABLE = "pendingNativeCallActionAvailable"

    internal fun shouldEmitPendingAction(intent: Intent, status: String): Boolean =
      intent.action == Intent.ACTION_MAIN
        && intent.data == null
        && status == "present"
  }

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "ChillyChatCallNotifications"

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    super.invalidate()
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) = Unit

  override fun onNewIntent(intent: Intent) {
    if (!shouldEmitPendingAction(intent, ChillyChatNativeCallActionStore.readStatus(reactContext))) return
    pendingActionEmitter()
  }

  @ReactMethod
  fun ensureNativeCallNotificationChannel(promise: Promise) {
    try {
      ChillyChatCallNotifications.ensureCallChannel(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("channel_error", "Unable to set up Chi'lly Chat call notification channel.", error)
    }
  }

  @ReactMethod
  fun readFullScreenCallAlertStatus(promise: Promise) {
    try {
      ChillyChatCallNotifications.ensureCallChannel(reactContext)
      val granted = ChillyChatCallNotifications.canUseFullScreenIntent(reactContext)
      val canOpenSettings = ChillyChatCallNotifications.canOpenFullScreenIntentSettings()
      val payload = Arguments.createMap().apply {
        putBoolean("available", true)
        putBoolean("granted", granted)
        putBoolean("canOpenSettings", canOpenSettings)
        putString("channelId", ChillyChatCallNotifications.CALL_CHANNEL_ID)
        putString(
          "message",
          if (granted) {
            "Android allows full-screen Chi'lly Chat call alerts on this device."
          } else {
            "Android requires full-screen call alert permission for lock-screen takeover."
          },
        )
      }
      promise.resolve(payload)
    } catch (error: Exception) {
      promise.reject("status_error", "Unable to read Android full-screen call alert status.", error)
    }
  }

  @ReactMethod
  fun openFullScreenCallAlertSettings(promise: Promise) {
    try {
      val intent = ChillyChatCallNotifications.buildFullScreenIntentSettingsIntent(reactContext)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: ActivityNotFoundException) {
      promise.reject("settings_unavailable", "Android full-screen call alert settings are not available on this device.", error)
    } catch (error: Exception) {
      promise.reject("settings_error", "Unable to open Android full-screen call alert settings.", error)
    }
  }

  @ReactMethod
  fun consumePendingNativeCallAction(promise: Promise) {
    try {
      Log.i("ChillyChatCallAction", "REACT_CONTEXT_READY")
      val pendingAction = ChillyChatNativeCallActionStore.consume(reactContext)
      if (pendingAction == null) {
        promise.resolve(null)
        return
      }
      val payload = Arguments.createMap().apply {
        putString("threadId", pendingAction.threadId)
        putString("callInviteId", pendingAction.callInviteId)
        putString("nativeCallAction", pendingAction.nativeCallAction)
        putString("requestKey", pendingAction.requestKey)
        putDouble("captureGeneration", pendingAction.captureGeneration.toDouble())
        putDouble("createdAt", pendingAction.createdAt.toDouble())
        putInt("schemaVersion", pendingAction.schemaVersion)
      }
      promise.resolve(payload)
    } catch (error: Exception) {
      promise.reject(
        "pending_action_error",
        "Unable to consume the pending Chi'lly Chat native call action.",
        error,
      )
    }
  }

  @ReactMethod
  fun readPendingNativeCallActionStatus(promise: Promise) {
    try {
      val payload = Arguments.createMap().apply {
        putString("status", ChillyChatNativeCallActionStore.readStatus(reactContext))
        putInt("schemaVersion", ChillyChatNativeCallActionStore.SCHEMA_VERSION)
      }
      promise.resolve(payload)
    } catch (error: Exception) {
      promise.reject(
        "pending_action_status_error",
        "Unable to read the Chi'lly Chat native call action status.",
        error,
      )
    }
  }
}
`,
  "ChillyChatCallNotificationPackage.kt": String.raw`package com.chillywood.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ChillyChatCallNotificationPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(ChillyChatCallNotificationModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`,
};

function ensureLine(contents, line) {
  return contents.includes(line) ? contents : `${contents.trimEnd()}\n${line}\n`;
}

function ensureDependencies(contents) {
  let next = contents;
  [
    '    implementation("androidx.core:core-ktx:1.13.1")',
    '    implementation("androidx.lifecycle:lifecycle-process:2.8.7")',
    '    implementation("com.google.firebase:firebase-messaging:25.0.1")',
  ].forEach((dependency) => {
    if (next.includes(dependency)) return;
    next = next.replace(
      '    implementation("com.facebook.react:react-android")',
      `    implementation("com.facebook.react:react-android")\n${dependency}`,
    );
  });
  return next;
}

function ensureMainApplicationPackage(contents) {
  if (contents.includes("ChillyChatCallNotificationPackage()")) return contents;
  const withExamplePackageAnchor = contents.replace(
    "              // add(MyReactNativePackage())",
    "              // add(MyReactNativePackage())\n              add(ChillyChatCallNotificationPackage())",
  );
  if (withExamplePackageAnchor !== contents) return withExamplePackageAnchor;

  return contents.replace(
    "          PackageList(this).packages.apply {",
    "          PackageList(this).packages.apply {\n              add(ChillyChatCallNotificationPackage())",
  );
}

const BACKUP_RULE_ALLOWED_KEYS = {
  legacy: new Set(["$", "exclude", "include"]),
  modern: new Set(["$", "cloud-backup", "cross-platform-transfer", "device-transfer"]),
};

function failBackupComposition(message) {
  const error = new Error(message);
  error.code = "ANDROID_BACKUP_RULE_COMPOSITION_CONFLICT";
  throw error;
}

function copyXml(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function assertSupportedBackupKeys(value, kind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failBackupComposition(`The ${kind} backup resource is malformed.`);
  }
  const unexpected = Object.keys(value).filter((key) => !BACKUP_RULE_ALLOWED_KEYS[kind].has(key));
  if (unexpected.length > 0) {
    failBackupComposition(`The ${kind} backup resource contains unsupported nodes: ${unexpected.join(", ")}.`);
  }
}

function ensureTransientPreferenceExclusion(entries, location) {
  if (entries != null && !Array.isArray(entries)) {
    failBackupComposition(`The ${location} backup rules contain a malformed exclude list.`);
  }
  const next = copyXml(entries ?? []);
  if (next.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry) || !entry.$ || typeof entry.$ !== "object" || Array.isArray(entry.$))) {
    failBackupComposition(`The ${location} backup rules contain a malformed exclude entry.`);
  }
  const matches = next.filter((entry) => (
    entry?.$?.domain === "sharedpref"
    && entry?.$?.path === TRANSIENT_ACTION_PREFERENCES_FILE
  ));
  if (matches.length === 0) {
    next.push({
      $: {
        domain: "sharedpref",
        path: TRANSIENT_ACTION_PREFERENCES_FILE,
      },
    });
  } else if (matches.length > 1) {
    const first = matches[0];
    return [
      ...next.filter((entry) => !matches.includes(entry)),
      first,
    ];
  }
  return next;
}

function composeLegacyBackupRules(existing) {
  const root = copyXml(existing?.["full-backup-content"] ?? {});
  assertSupportedBackupKeys(root, "legacy");
  if (root.include != null && !Array.isArray(root.include)) {
    failBackupComposition("The legacy backup resource contains a malformed include list.");
  }
  root.exclude = ensureTransientPreferenceExclusion(root.exclude, "legacy");
  return { "full-backup-content": root };
}

function ensureModernBackupSection(root, key) {
  const sections = Array.isArray(root[key]) ? root[key] : [];
  if (sections.length > 1) {
    failBackupComposition(`The Android 12+ backup resource has multiple ${key} nodes.`);
  }
  const section = copyXml(sections[0] ?? {});
  if (!section || typeof section !== "object" || Array.isArray(section)) {
    failBackupComposition(`The Android 12+ ${key} rule is malformed.`);
  }
  const unexpected = Object.keys(section).filter((name) => !["$", "exclude", "include"].includes(name));
  if (unexpected.length > 0) {
    failBackupComposition(`The Android 12+ ${key} rule contains unsupported nodes: ${unexpected.join(", ")}.`);
  }
  if (section.include != null && !Array.isArray(section.include)) {
    failBackupComposition(`The Android 12+ ${key} rules contain a malformed include list.`);
  }
  section.exclude = ensureTransientPreferenceExclusion(section.exclude, `Android 12+ ${key}`);
  root[key] = [section];
}

function composeModernBackupRules(existing) {
  const root = copyXml(existing?.["data-extraction-rules"] ?? {});
  assertSupportedBackupKeys(root, "modern");
  ensureModernBackupSection(root, "cloud-backup");
  ensureModernBackupSection(root, "device-transfer");
  ensureModernBackupSection(root, "cross-platform-transfer");
  const crossPlatformSection = root["cross-platform-transfer"][0];
  const existingPlatform = String(crossPlatformSection.$?.platform ?? "").trim().toLowerCase();
  if (existingPlatform && existingPlatform !== "ios") {
    failBackupComposition("The cross-platform transfer resource targets an unsupported platform.");
  }
  crossPlatformSection.$ = {
    ...(crossPlatformSection.$ ?? {}),
    platform: "ios",
  };
  return { "data-extraction-rules": root };
}

function backupResourcePath(platformProjectRoot, resourceName) {
  return path.join(
    platformProjectRoot,
    "app/src/main/res/xml",
    `${resourceName}.xml`,
  );
}

async function readReferencedBackupRules(platformProjectRoot, reference, expectedRoot, ownedResourceName) {
  if (!reference) return null;
  const match = /^@xml\/([a-z][a-z0-9_]*)$/u.exec(reference);
  if (!match) {
    failBackupComposition(`Unsupported Android backup resource reference: ${reference}.`);
  }
  const resourceName = match[1];
  const resourcePath = backupResourcePath(platformProjectRoot, resourceName);
  if (!fs.existsSync(resourcePath)) {
    if (resourceName === ownedResourceName) return null;
    failBackupComposition(`Referenced Android backup resource is missing: ${resourceName}.`);
  }
  const parsed = await XML.readXMLAsync({ path: resourcePath });
  if (!parsed?.[expectedRoot]) {
    failBackupComposition(`Android backup resource ${resourceName} is not ${expectedRoot}.`);
  }
  return parsed;
}

async function ensureBackupResources(nextConfig, application) {
  const platformProjectRoot = nextConfig.modRequest.platformProjectRoot;
  const legacyRules = await readReferencedBackupRules(
    platformProjectRoot,
    application.$?.["android:fullBackupContent"],
    "full-backup-content",
    LEGACY_BACKUP_RESOURCE_NAME,
  );
  const modernRules = await readReferencedBackupRules(
    platformProjectRoot,
    application.$?.["android:dataExtractionRules"],
    "data-extraction-rules",
    MODERN_BACKUP_RESOURCE_NAME,
  );
  const xmlDir = path.dirname(backupResourcePath(platformProjectRoot, LEGACY_BACKUP_RESOURCE_NAME));
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(
    backupResourcePath(platformProjectRoot, LEGACY_BACKUP_RESOURCE_NAME),
    `${XML.format(composeLegacyBackupRules(legacyRules)).trim()}\n`,
    "utf8",
  );
  fs.writeFileSync(
    backupResourcePath(platformProjectRoot, MODERN_BACKUP_RESOURCE_NAME),
    `${XML.format(composeModernBackupRules(modernRules)).trim()}\n`,
    "utf8",
  );
  application.$ = {
    ...(application.$ ?? {}),
    "android:dataExtractionRules": `@xml/${MODERN_BACKUP_RESOURCE_NAME}`,
    "android:fullBackupContent": `@xml/${LEGACY_BACKUP_RESOURCE_NAME}`,
  };
}

function ensureUsesPermission(androidManifest, permissionName) {
  const permissions = androidManifest.manifest["uses-permission"] ?? [];
  const exists = permissions.some((permission) => permission?.$?.["android:name"] === permissionName);
  if (!exists) permissions.push({ $: { "android:name": permissionName } });
  androidManifest.manifest["uses-permission"] = permissions;
}

function ensureManifestServices(androidManifest) {
  androidManifest.manifest.$ = {
    ...(androidManifest.manifest.$ ?? {}),
    "xmlns:tools": "http://schemas.android.com/tools",
  };
  const application = androidManifest.manifest.application?.[0];
  if (!application) return;

  const services = (application.service ?? []).filter((service) => {
    const name = service?.$?.["android:name"];
    return name !== ".ChillyChatFirebaseMessagingService"
      && !(name === "expo.modules.notifications.service.ExpoFirebaseMessagingService" && service?.$?.["tools:node"] === "remove");
  });
  services.push({
    $: {
      "android:name": "expo.modules.notifications.service.ExpoFirebaseMessagingService",
      "tools:node": "remove",
    },
  });
  services.push({
    $: {
      "android:exported": "false",
      "android:name": ".ChillyChatFirebaseMessagingService",
    },
    "intent-filter": [{
      $: { "android:priority": "10" },
      action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
    }],
  });
  application.service = services;

  const receivers = (application.receiver ?? []).filter((receiver) => (
    receiver?.$?.["android:name"] !== ".ChillyChatCallNotificationActionReceiver"
  ));
  receivers.push({
    $: {
      "android:exported": "false",
      "android:name": ".ChillyChatCallNotificationActionReceiver",
    },
  });
  application.receiver = receivers;

  const activities = (application.activity ?? []).filter((activity) => (
    activity?.$?.["android:name"] !== ".ChillyChatIncomingCallActivity"
  ));
  activities.push({
    $: {
      "android:name": ".ChillyChatIncomingCallActivity",
      "android:exported": "false",
      "android:excludeFromRecents": "true",
      "android:launchMode": "singleTop",
      "android:taskAffinity": "",
      "android:theme": "@android:style/Theme.Material.NoActionBar",
    },
  });
  application.activity = activities;
}

function withChillyChatNativeCallNotifications(config) {
  config = withAndroidManifest(config, async (nextConfig) => {
    ensureUsesPermission(nextConfig.modResults, "android.permission.USE_FULL_SCREEN_INTENT");
    ensureManifestServices(nextConfig.modResults);
    const application = nextConfig.modResults.manifest.application?.[0];
    if (!application) failBackupComposition("AndroidManifest application is missing.");
    await ensureBackupResources(nextConfig, application);
    return nextConfig;
  });

  config = withAppBuildGradle(config, (nextConfig) => {
    nextConfig.modResults.contents = ensureDependencies(nextConfig.modResults.contents);
    return nextConfig;
  });

  config = withMainApplication(config, (nextConfig) => {
    nextConfig.modResults.contents = ensureMainApplicationPackage(nextConfig.modResults.contents);
    return nextConfig;
  });

  config = withDangerousMod(config, ["android", (nextConfig) => {
    const packageDir = path.join(
      nextConfig.modRequest.platformProjectRoot,
      "app/src/main/java",
      JAVA_PACKAGE_PATH,
    );
    fs.mkdirSync(packageDir, { recursive: true });
    Object.entries(NATIVE_FILES).forEach(([fileName, contents]) => {
      fs.writeFileSync(path.join(packageDir, fileName), ensureLine(contents, ""), "utf8");
    });
    return nextConfig;
  }]);

  return config;
}

module.exports = createRunOncePlugin(
  withChillyChatNativeCallNotifications,
  "with-chilly-chat-native-call-notifications",
  "1.2.0",
);

module.exports.__test = {
  composeLegacyBackupRules,
  composeModernBackupRules,
  ensureManifestServices,
  nativeFiles: Object.freeze({ ...NATIVE_FILES }),
};
