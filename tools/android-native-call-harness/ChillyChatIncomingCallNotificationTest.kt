package com.chillywood.mobile

import android.app.AlarmManager
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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
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
  fun clearNotifications() { manager.cancelAll() }

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
