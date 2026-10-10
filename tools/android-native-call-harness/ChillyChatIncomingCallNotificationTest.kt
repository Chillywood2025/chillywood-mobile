package com.chillywood.mobile

import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import java.text.SimpleDateFormat
import java.time.Duration
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Robolectric
import com.google.firebase.messaging.RemoteMessage
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowAlarmManager
import org.robolectric.shadows.ShadowSystemClock

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@LooperMode(LooperMode.Mode.PAUSED)
class ChillyChatIncomingCallNotificationTest {
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val manager = context.getSystemService(NotificationManager::class.java)
  private val inviteId = "22222222-2222-4222-8222-222222222222"
  private fun data(expiresAtMs: Long, invite: String = inviteId) = mapOf(
    "callInviteId" to invite,
    "threadId" to "11111111-1111-4111-8111-111111111111",
    "expiresAt" to SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(expiresAtMs)),
    "callType" to "video",
  )

  @Before
  fun clearNotifications() {
    manager.cancelAll()
    context.getSharedPreferences("chilly_chat_native_call_action_v1", Context.MODE_PRIVATE).edit().clear().commit()
  }

  @Test
  fun actualAnswerPendingIntentDispatchesReceiverAndCreatesOneConsumableStoreAction() {
    val expiresAt = System.currentTimeMillis() + 90_000L
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt))
    val notification = manager.activeNotifications.single().notification
    val action = notification.actions.single {
      shadowOf(it.actionIntent).savedIntent.action == ChillyChatCallNotifications.ACTION_ANSWER
    }.actionIntent
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
    // Send the generated immutable PendingIntent, allowing the actual Android
    // dispatch path to invoke the generated private BroadcastReceiver. This
    // stops at the store/JS boundary; it is not FCM, Activity, or RN installation proof.
    action.send()
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    val captured = ChillyChatNativeCallActionStore.consume(context)
    assertNotNull(captured)
    assertEquals(inviteId, captured!!.callInviteId)
    assertEquals("11111111-1111-4111-8111-111111111111", captured.threadId)
    assertEquals("answer", captured.nativeCallAction)
    assertEquals(2, captured.schemaVersion)
    assertTrue(captured.captureGeneration > 0)
    assertTrue(captured.requestKey.matches(Regex("^[0-9a-f]{64}$")))
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    action.send()
    shadowOf(Looper.getMainLooper()).idle()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  @Config(sdk = [30])
  fun terminalFcmClearsOnlyItsExactPresentedInviteWithoutActionOrLaunch() {
    val service = Robolectric.buildService(ChillyChatFirebaseMessagingService::class.java).create().get()
    for (terminalAction in listOf("cancel", "declined", "end", "timeout")) {
      val original = data(System.currentTimeMillis() + 90_000L)
      ChillyChatCallNotifications.showIncomingCallNotification(context, original)
      val terminal = original + mapOf("action" to terminalAction, "nativeCallStyle" to "terminal", "dismissCall" to "true", "openCall" to "false")
      service.onMessageReceived(RemoteMessage(terminal))
      assertEquals("terminal $terminalAction must remove the native presentation", 0, manager.activeNotifications.size)
      assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
      assertNull(shadowOf(context as Application).nextStartedActivity)
      assertEquals(0, service.forwardedMessages)
      service.onMessageReceived(RemoteMessage(terminal))
      assertEquals(0, manager.activeNotifications.size)
    }
  }

  @Test
  @Config(sdk = [30])
  fun terminalFcmCannotClearOtherInviteThreadOrUnrecognizedTerminalPayload() {
    val service = Robolectric.buildService(ChillyChatFirebaseMessagingService::class.java).create().get()
    val firstId = "e95279f8-6588-4a82-b3e5-c5e0a7cbbf43"
    val secondId = "55ac6903-5dc8-4206-a04e-599644694f47"
    assertEquals(firstId.hashCode() and 0x0fffffff, secondId.hashCode() and 0x0fffffff)
    val first = data(System.currentTimeMillis() + 90_000L, firstId)
    val second = data(System.currentTimeMillis() + 90_000L, secondId)
    ChillyChatCallNotifications.showIncomingCallNotification(context, first)
    ChillyChatCallNotifications.showIncomingCallNotification(context, second)
    val terminal = first + mapOf("action" to "cancel", "nativeCallStyle" to "terminal", "dismissCall" to "true", "openCall" to "false")
    val invalid = listOf(
      terminal - "callInviteId", terminal - "threadId",
      terminal + ("callInviteId" to inviteId),
      terminal + ("threadId" to "33333333-3333-4333-8333-333333333333"),
      terminal + ("action" to "incoming"),
      terminal + ("nativeCallStyle" to "unknown"), terminal + ("dismissCall" to "false"),
    )
    for (payload in invalid) {
      service.onMessageReceived(RemoteMessage(payload))
      assertEquals(2, manager.activeNotifications.size)
      assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
      assertNull(shadowOf(context as Application).nextStartedActivity)
    }
    // Clearing the exact former invite must not retire a newer/different call,
    // even when legacy numeric notification IDs collide. No account authority
    // is inferred: terminal cleanup never consumes or creates a native action.
    ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, second.getValue("threadId"), secondId, "answer")
    service.onMessageReceived(RemoteMessage(terminal))
    assertEquals("chilly_chat_call:$secondId", manager.activeNotifications.single().tag)
    assertEquals(secondId, ChillyChatNativeCallActionStore.consume(context)?.callInviteId)
    assertNull(shadowOf(context as Application).nextStartedActivity)
  }

  @Test
  fun ordinaryPushStillForwardsToExpo() {
    val service = Robolectric.buildService(ChillyChatFirebaseMessagingService::class.java).create().get()
    service.onMessageReceived(RemoteMessage(mapOf("title" to "Ordinary notification")))
    assertEquals(1, service.forwardedMessages)
    assertEquals(0, manager.activeNotifications.size)
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertNull(shadowOf(context as Application).nextStartedActivity)
  }

  @Test
  @Config(sdk = [30])
  fun androidElevenTimeoutDeleteDispatchDoesNotBecomeDeclineOrLaunch() {
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(System.currentTimeMillis() + 90_000L))
    val posted = manager.activeNotifications.single()
    val notification = posted.notification
    ShadowSystemClock.advanceBy(Duration.ofMillis(notification.timeoutAfter))
    // Android 11 NotificationManagerService cancels REASON_TIMEOUT with
    // sendDelete=true, removes the presentation, then sends its deleteIntent.
    // Model that OS boundary explicitly: Robolectric does not implement NMS
    // timeout dispatch. The app's actual generated PendingIntent/receiver runs.
    manager.cancel(posted.tag, posted.id)
    notification.deleteIntent?.send()
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(0, manager.activeNotifications.size)
    assertEquals("automatic expiration is not a user Decline", "empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertNull("automatic expiration must not launch the app", shadowOf(context as Application).nextStartedActivity)
  }

  @Test
  @Config(sdk = [30])
  fun explicitDeclineStillCreatesOnlyItsOwnedActionAndLaunchesOnce() {
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(System.currentTimeMillis() + 90_000L))
    val notification = manager.activeNotifications.single().notification
    val decline = notification.actions.single {
      shadowOf(it.actionIntent).savedIntent.action == ChillyChatCallNotifications.ACTION_DECLINE
    }.actionIntent
    decline.send()
    shadowOf(Looper.getMainLooper()).idle()
    val captured = ChillyChatNativeCallActionStore.consume(context)
    assertEquals(inviteId, captured?.callInviteId)
    assertEquals("decline", captured?.nativeCallAction)
    assertNotNull(shadowOf(context as Application).nextStartedActivity)
    assertEquals(0, manager.activeNotifications.size)
    decline.send()
    shadowOf(Looper.getMainLooper()).idle()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertNull(shadowOf(context as Application).nextStartedActivity)
  }

  @Test
  fun receiverRejectsMalformedOrUnrecognizedActionsWithoutCreatingPendingAnswer() {
    val receiver = ChillyChatCallNotificationActionReceiver()
    for (action in listOf(ChillyChatCallNotifications.ACTION_ANSWER, "not-a-native-action")) {
      receiver.onReceive(context, Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
        this.action = action
        putExtra("callInviteId", if (action == ChillyChatCallNotifications.ACTION_ANSWER) "malformed" else inviteId)
        putExtra("threadId", "11111111-1111-4111-8111-111111111111")
      })
      assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun generatedNotificationUsesServerRemainderAndRetainsDeadlineAcrossRedelivery() {
    val expiresAt = System.currentTimeMillis() + 90_000L
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt))
    val first = manager.activeNotifications.single().notification
    assertTrue(first.timeoutAfter in 89_900L..90_000L)
    val firstElapsedDeadline = first.extras.getLong("chillywood.invite.elapsedDeadlineMs")
    ShadowSystemClock.advanceBy(Duration.ofSeconds(20))
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt + 10_000L))
    val duplicate = manager.activeNotifications.single().notification
    assertTrue(duplicate.timeoutAfter in 69_900L..70_000L)
    assertEquals(expiresAt, duplicate.extras.getLong("chillywood.invite.expiresAtMs"))
    assertEquals(firstElapsedDeadline, duplicate.extras.getLong("chillywood.invite.elapsedDeadlineMs"))
  }

  @Test
  fun expiredOrMissingDeadlineNeverCreatesOrLeavesActionableNotification() {
    val now = System.currentTimeMillis()
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(now + 90_000L))
    assertEquals(1, manager.activeNotifications.size)
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(now))
    assertEquals(0, manager.activeNotifications.size)
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(now + 90_000L) - "expiresAt")
    assertEquals(0, manager.activeNotifications.size)
  }

  @Test
  @Config(sdk = [25])
  fun androidSevenExpiresThroughPrivateAlarmWithoutCreatingCallAction() {
    ShadowAlarmManager.setAutoSchedule(false)
    val expiresAt = System.currentTimeMillis() + 90_000L
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt))
    val alarmManager = shadowOf(context.getSystemService(AlarmManager::class.java))
    val alarm = alarmManager.peekNextScheduledAlarm()
    assertEquals(manager.activeNotifications.single().notification.extras.getLong("chillywood.invite.elapsedDeadlineMs"), alarm.triggerAtMs)
    // An early or stale callback cannot retire a currently valid presentation.
    val early = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = ChillyChatCallNotifications.ACTION_EXPIRE
      putExtra("callInviteId", inviteId)
      putExtra("chillywood.invite.expiresAtMs", expiresAt)
    }
    ChillyChatCallNotificationActionReceiver().onReceive(context, early)
    assertEquals(1, manager.activeNotifications.size)
    ShadowSystemClock.advanceBy(Duration.ofSeconds(90))
    // Dispatch the real scheduled PendingIntent through its private receiver.
    alarmManager.fireAlarm(alarm)
    // Robolectric posts BroadcastReceiver dispatch to the main Handler. Drain
    // that actual dispatch before asserting its effects in paused-looper mode.
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(0, manager.activeNotifications.size)
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun collidingLegacyNotificationHashesKeepDistinctActionsAndExpiryOwnership() {
    // Synthetic valid UUIDs with the same old 28-bit notification/request ID.
    val firstId = "e95279f8-6588-4a82-b3e5-c5e0a7cbbf43"
    val secondId = "55ac6903-5dc8-4206-a04e-599644694f47"
    assertEquals(firstId.hashCode() and 0x0fffffff, secondId.hashCode() and 0x0fffffff)
    val expiresAt = System.currentTimeMillis() + 90_000L
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt, firstId))
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(expiresAt, secondId))
    assertEquals(2, manager.activeNotifications.size)
    val notifications = manager.activeNotifications.associateBy { it.tag }
    val first = notifications.getValue("chilly_chat_call:$firstId").notification
    val second = notifications.getValue("chilly_chat_call:$secondId").notification
    fun answer(notification: android.app.Notification) = notification.actions.first {
      shadowOf(it.actionIntent).savedIntent.action == ChillyChatCallNotifications.ACTION_ANSWER
    }.actionIntent
    val firstAction = answer(first)
    val secondAction = answer(second)
    assertNotEquals(firstAction, secondAction)
    assertEquals(firstId, shadowOf(firstAction).savedIntent.getStringExtra("callInviteId"))
    assertEquals(secondId, shadowOf(secondAction).savedIntent.getStringExtra("callInviteId"))
    ChillyChatCallNotifications.clearIncomingCallNotification(context, firstId)
    assertEquals("chilly_chat_call:$secondId", manager.activeNotifications.single().tag)
    // Invalid/expired receipt for the colliding invite cannot clear the second.
    ChillyChatCallNotifications.showIncomingCallNotification(context, data(System.currentTimeMillis(), firstId))
    assertEquals("chilly_chat_call:$secondId", manager.activeNotifications.single().tag)
  }
}
