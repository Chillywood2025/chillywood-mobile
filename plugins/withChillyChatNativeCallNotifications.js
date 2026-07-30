const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "com.chillywood.mobile";
const JAVA_PACKAGE_PATH = PACKAGE_NAME.replace(/\./g, "/");
const NATIVE_FILES = {
  "ChillyChatNativeCallActionStore.kt": String.raw`package com.chillywood.mobile

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import java.security.MessageDigest

object ChillyChatNativeCallActionStore {
  const val SCHEMA_VERSION = 1
  private const val LOG_TAG = "ChillyChatCallAction"
  private const val PREFERENCES_NAME = "chilly_chat_native_call_action_v1"
  private const val KEY_SCHEMA_VERSION = "schema_version"
  private const val KEY_THREAD_ID = "thread_id"
  private const val KEY_CALL_INVITE_ID = "call_invite_id"
  private const val KEY_NATIVE_ACTION = "native_action"
  private const val KEY_REQUEST_KEY = "request_key"
  private const val KEY_CREATED_AT = "created_at"
  private const val KEY_CREATED_ELAPSED_AT = "created_elapsed_at"
  private const val KEY_LAST_CONSUMED_REQUEST_KEY = "last_consumed_request_key"
  private const val KEY_LAST_CONSUMED_ELAPSED_AT = "last_consumed_elapsed_at"
  private const val MAX_ACTION_AGE_MS = 45_000L
  private val UUID_PATTERN = Regex(
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
  )
  private val REQUEST_KEY_PATTERN = Regex("^[0-9a-f]{64}$")

  data class PendingAction(
    val threadId: String,
    val callInviteId: String,
    val nativeCallAction: String,
    val requestKey: String,
    val createdAt: Long,
    val schemaVersion: Int,
  )

  @Synchronized
  fun capture(context: Context, intent: Intent?): Boolean {
    val data = intent?.data ?: return false
    if (!data.scheme.equals("chillywoodmobile", ignoreCase = true)) return false
    if (!data.host.equals("chat", ignoreCase = true)) return false
    if (data.userInfo != null || data.port != -1 || data.fragment != null) return false
    if (data.pathSegments.size != 1) return false

    val threadId = normalizeUuid(data.pathSegments.firstOrNull()) ?: return false
    val inviteId = normalizeUuid(data.getQueryParameter("callInviteId")) ?: return false
    val nativeAction = normalizeAction(data.getQueryParameter("nativeCallAction")) ?: return false
    if (!matchesOptionalUuidExtra(intent, "threadId", threadId)) return false
    if (!matchesOptionalUuidExtra(intent, "callInviteId", inviteId)) return false
    if (!matchesOptionalActionExtra(intent, "nativeCallAction", nativeAction)) return false
    Log.i(LOG_TAG, "ACTION_CAPTURED")

    val requestKey = sha256("$threadId:$inviteId:$nativeAction")
    val preferences = preferences(context)
    val elapsedAt = SystemClock.elapsedRealtime()
    val existingRequestKey = preferences.getString(KEY_REQUEST_KEY, null).orEmpty()
    val existingElapsedAt = preferences.getLong(KEY_CREATED_ELAPSED_AT, 0L)
    if (isFresh(existingElapsedAt, elapsedAt)) {
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
      .putLong(KEY_CREATED_AT, System.currentTimeMillis())
      .putLong(KEY_CREATED_ELAPSED_AT, elapsedAt)
      .commit()
    if (persisted) Log.i(LOG_TAG, "ACTION_BUFFERED")
    return persisted
  }

  fun captureForActivity(context: Context, intent: Intent?) {
    if (normalizeAction(
      intent?.getStringExtra("nativeCallAction")
        ?: intent?.data?.getQueryParameter("nativeCallAction"),
    ) == null) return
    if (capture(context, intent)) return

    intent?.apply {
      data = null
      action = Intent.ACTION_MAIN
      removeCategory(Intent.CATEGORY_BROWSABLE)
      removeExtra("callInviteId")
      removeExtra("threadId")
      removeExtra("nativeCallAction")
      removeExtra("openCall")
    }
  }

  @Synchronized
  fun consume(context: Context): PendingAction? {
    val preferences = preferences(context)
    val schemaVersion = preferences.getInt(KEY_SCHEMA_VERSION, 0)
    val threadId = normalizeUuid(preferences.getString(KEY_THREAD_ID, null))
    val inviteId = normalizeUuid(preferences.getString(KEY_CALL_INVITE_ID, null))
    val nativeAction = normalizeAction(preferences.getString(KEY_NATIVE_ACTION, null))
    val requestKey = preferences.getString(KEY_REQUEST_KEY, null).orEmpty()
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
      createdAt,
      schemaVersion,
    )
  }

  @Synchronized
  fun readStatus(context: Context): String {
    val preferences = preferences(context)
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

  private fun matchesOptionalUuidExtra(intent: Intent, key: String, expected: String): Boolean {
    if (!intent.hasExtra(key)) return true
    return normalizeUuid(intent.getStringExtra(key)) == expected
  }

  private fun matchesOptionalActionExtra(intent: Intent, key: String, expected: String): Boolean {
    if (!intent.hasExtra(key)) return true
    return normalizeAction(intent.getStringExtra(key)) == expected
  }

  private fun isFresh(createdElapsedAt: Long, currentElapsedAt: Long): Boolean {
    val ageMs = currentElapsedAt - createdElapsedAt
    return createdElapsedAt > 0L && ageMs in 0..MAX_ACTION_AGE_MS
  }

  private fun removePending(editor: SharedPreferences.Editor): SharedPreferences.Editor =
    editor
      .remove(KEY_SCHEMA_VERSION)
      .remove(KEY_THREAD_ID)
      .remove(KEY_CALL_INVITE_ID)
      .remove(KEY_NATIVE_ACTION)
      .remove(KEY_REQUEST_KEY)
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
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner

object ChillyChatCallNotifications {
  const val CALL_CHANNEL_ID = "chilly_chat_calls_fullscreen_v1"
  const val ACTION_ANSWER = "com.chillywood.mobile.action.ANSWER_CHILLY_CHAT_CALL"
  const val ACTION_DECLINE = "com.chillywood.mobile.action.DECLINE_CHILLY_CHAT_CALL"
  private const val NOTIFICATION_ID_BASE = 770000
  private val RING_VIBRATION_PATTERN = longArrayOf(0, 480, 220, 480, 220, 720)

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

  fun showIncomingCallNotification(context: Context, data: Map<String, String>) {
    ensureCallChannel(context)

    val inviteId = data["callInviteId"].orEmpty()
    val threadId = data["threadId"].orEmpty()
    if (inviteId.isBlank() || threadId.isBlank()) return

    val callType = data["callType"].orEmpty().ifBlank { "voice" }
    val callerName = data["callerName"].orEmpty().ifBlank { "Someone" }
    val resolvedCallType = if (callType == "video") "video" else "voice"
    val title = data["title"].orEmpty().ifBlank {
      "Incoming Chi'lly Chat " + resolvedCallType + " call"
    }
    val body = data["body"].orEmpty().ifBlank {
      "$callerName is calling you on Chi'lly Chat."
    }

    val contentIntent = buildActivityPendingIntent(context, data, "incoming", 0)
    val answerIntent = buildActivityPendingIntent(context, data, "answer", 1)
    val declineIntent = buildActionPendingIntent(context, data, ACTION_DECLINE, 2)
    val fullScreenIntent = buildActivityPendingIntent(context, data, "incoming", 3)
    val caller = Person.Builder()
      .setName(callerName)
      .setImportant(true)
      .build()

    val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setTimeoutAfter(45_000)
      .setContentIntent(contentIntent)
      .setDeleteIntent(buildActionPendingIntent(context, data, ACTION_DECLINE, 4))
      .setFullScreenIntent(fullScreenIntent, canUseFullScreenIntent(context))
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, answerIntent))
      .build()
      .apply {
        flags = flags or Notification.FLAG_INSISTENT
      }

    if (
      Build.VERSION.SDK_INT < 33
      || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      NotificationManagerCompat.from(context).notify(notificationIdForInvite(inviteId), notification)
    }
  }

  fun clearIncomingCallNotification(context: Context, inviteId: String?) {
    if (inviteId.isNullOrBlank()) return
    NotificationManagerCompat.from(context).cancel(notificationIdForInvite(inviteId))
  }

  private fun buildActivityPendingIntent(
    context: Context,
    data: Map<String, String>,
    nativeAction: String,
    requestOffset: Int,
  ): PendingIntent {
    val deepLink = buildDeepLink(data, nativeAction)
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
      putExtra("callInviteId", data["callInviteId"])
      putExtra("threadId", data["threadId"])
      putExtra("nativeCallAction", nativeAction)
      putExtra("openCall", if (nativeAction == "answer") "1" else "0")
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

  private fun buildDeepLink(data: Map<String, String>, nativeAction: String): Uri {
    val threadId = data["threadId"].orEmpty()
    val inviteId = data["callInviteId"].orEmpty()
    val builder = Uri.Builder()
      .scheme("chillywoodmobile")
      .authority("chat")
      .appendPath(threadId)
      .appendQueryParameter("callInviteId", inviteId)
      .appendQueryParameter("nativeCallAction", nativeAction)
    if (nativeAction == "answer") {
      builder.appendQueryParameter("openCall", "1")
    }
    return builder.build()
  }

  private fun notificationIdForInvite(inviteId: String): Int =
    NOTIFICATION_ID_BASE + (inviteId.hashCode() and 0x0FFFFFFF)

  fun openDeepLinkForAction(context: Context, inviteId: String?, threadId: String?, nativeAction: String) {
    if (inviteId.isNullOrBlank() || threadId.isNullOrBlank()) return
    val data = mapOf(
      "callInviteId" to inviteId,
      "threadId" to threadId,
    )
    val deepLink = buildDeepLink(data, nativeAction)
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
      putExtra("callInviteId", inviteId)
      putExtra("threadId", threadId)
      putExtra("nativeCallAction", nativeAction)
      putExtra("openCall", if (nativeAction == "answer") "1" else "0")
    }
    if (!ChillyChatNativeCallActionStore.capture(context, intent)) return
    clearIncomingCallNotification(context, inviteId)
    context.startActivity(intent)
  }
}
`,
  "ChillyChatFirebaseMessagingService.kt": String.raw`package com.chillywood.mobile

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class ChillyChatFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
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
    val inviteId = intent.getStringExtra("callInviteId")
    val threadId = intent.getStringExtra("threadId")
    val nativeAction = when (intent.action) {
      ChillyChatCallNotifications.ACTION_ANSWER -> "answer"
      ChillyChatCallNotifications.ACTION_DECLINE -> "decline"
      else -> "incoming"
    }

    ChillyChatCallNotifications.openDeepLinkForAction(context, inviteId, threadId, nativeAction)
  }
}
`,
  "ChillyChatCallNotificationModule.kt": String.raw`package com.chillywood.mobile

import android.content.ActivityNotFoundException
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ChillyChatCallNotificationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ChillyChatCallNotifications"

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

function ensureMainActivityActionCapture(contents) {
  let next = contents;
  if (!next.includes("import android.content.Intent")) {
    next = next.replace(
      "import android.os.Build",
      "import android.content.Intent\nimport android.os.Build",
    );
  }
  if (!next.includes("ChillyChatNativeCallActionStore.captureForActivity(this, intent)")) {
    next = next.replace(
      "  override fun onCreate(savedInstanceState: Bundle?) {",
      "  override fun onCreate(savedInstanceState: Bundle?) {\n    ChillyChatNativeCallActionStore.captureForActivity(this, intent)",
    );
  }
  if (!next.includes("override fun onNewIntent(intent: Intent)")) {
    next = next.replace(
      "  /**\n   * Returns the name of the main component registered from JavaScript.",
      `  override fun onNewIntent(intent: Intent) {
    ChillyChatNativeCallActionStore.captureForActivity(this, intent)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript.`,
    );
  }
  return next;
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
}

function withChillyChatNativeCallNotifications(config) {
  config = withAndroidManifest(config, (nextConfig) => {
    ensureUsesPermission(nextConfig.modResults, "android.permission.USE_FULL_SCREEN_INTENT");
    ensureManifestServices(nextConfig.modResults);
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

  config = withMainActivity(config, (nextConfig) => {
    nextConfig.modResults.contents = ensureMainActivityActionCapture(nextConfig.modResults.contents);
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
  "1.1.0",
);
