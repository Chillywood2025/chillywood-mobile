package com.chillywood.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class ChillyChatNativeCallActionStoreTest {
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val preferencesName = "chilly_chat_native_call_action_v1"
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Before
  fun clearState() {
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
  }

  private fun intent(action: String = "answer", thread: String = threadId, invite: String = inviteId) =
    Intent(
      Intent.ACTION_VIEW,
      Uri.parse("chillywoodmobile://chat/$thread?callInviteId=$invite&nativeCallAction=$action"),
    ).apply {
      setClassName(context.packageName, "${context.packageName}.MainActivity")
      putExtra("threadId", thread)
      putExtra("callInviteId", invite)
      putExtra("nativeCallAction", action)
    }

  @Test
  fun validAnswerAndDeclinePersistOnlyApprovedPrivateSchema() {
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent("answer")))
    val answer = ChillyChatNativeCallActionStore.consume(context)
    assertEquals("answer", answer?.nativeCallAction)
    clearState()
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent("decline")))
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    assertEquals(
      setOf("schema_version", "thread_id", "call_invite_id", "native_action", "request_key", "created_at", "created_elapsed_at"),
      preferences.all.keys,
    )
    assertFalse(preferences.all.keys.any { it.contains("token") || it.contains("credential") || it.contains("media") || it.contains("caller") })
  }

  @Test
  fun malformedUnsupportedAndMismatchedInputsFailClosed() {
    assertFalse(ChillyChatNativeCallActionStore.capture(context, intent(thread = "malformed")))
    assertFalse(ChillyChatNativeCallActionStore.capture(context, intent(invite = "malformed")))
    assertFalse(ChillyChatNativeCallActionStore.capture(context, intent(action = "incoming")))
    assertFalse(ChillyChatNativeCallActionStore.capture(context, intent().putExtra("callInviteId", "33333333-3333-4333-8333-333333333333")))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun duplicateDoesNotExtendOriginalTtlAndReplayIsDenied() {
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent()))
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val originalElapsed = preferences.getLong("created_elapsed_at", 0L)
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent()))
    assertEquals(originalElapsed, preferences.getLong("created_elapsed_at", -1L))
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    assertFalse(ChillyChatNativeCallActionStore.capture(context, intent()))
  }

  @Test
  fun expiredActionIsDeletedAndDenied() {
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent()))
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit()
      .putLong("created_elapsed_at", SystemClock.elapsedRealtime() - 45_001L)
      .commit()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun consumeReturnsExactlyOnce() {
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent()))
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun concurrentConsumeHasOneWinner() {
    assertTrue(ChillyChatNativeCallActionStore.capture(context, intent()))
    val start = CountDownLatch(1)
    val pool = Executors.newFixedThreadPool(8)
    val results = Collections.synchronizedList(mutableListOf<Boolean>())
    repeat(8) {
      pool.submit {
        start.await()
        results += ChillyChatNativeCallActionStore.consume(context) != null
      }
    }
    start.countDown()
    pool.shutdown()
    assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
    assertEquals(1, results.count { it })
  }

  @Test
  fun explicitReceiverPersistsBeforeLaunchingActivity() {
    val receiverIntent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = ChillyChatCallNotifications.ACTION_DECLINE
      putExtra("threadId", threadId)
      putExtra("callInviteId", inviteId)
    }
    ChillyChatCallNotificationActionReceiver().onReceive(context, receiverIntent)
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    val launched = shadowOf(context as android.app.Application).nextStartedActivity
    assertNotNull(launched)
    assertEquals(context.packageName, launched.component?.packageName)
  }
}
