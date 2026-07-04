const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "com.chillywood.mobile";
const JAVA_PACKAGE_PATH = PACKAGE_NAME.replace(/\./g, "/");
const NATIVE_FILES = {
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
    clearIncomingCallNotification(context, inviteId)
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
  "1.0.0",
);
