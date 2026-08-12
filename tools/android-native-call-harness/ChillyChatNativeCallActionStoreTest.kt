package com.chillywood.mobile

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.test.core.app.ApplicationProvider
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.time.Duration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowSystemClock

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], manifest = Config.NONE)
class ChillyChatNativeCallActionStoreTest {
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val preferencesName = "chilly_chat_native_call_action_v1"
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Before
  fun clearState() {
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
  }

  private fun capture(action: String = "answer", thread: String = threadId, invite: String = inviteId) =
    ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, thread, invite, action)

  @Test
  fun validAnswerAndDeclinePersistOnlyApprovedPrivateSchema() {
    assertTrue(capture("answer"))
    val answer = ChillyChatNativeCallActionStore.consume(context)
    assertEquals("answer", answer?.nativeCallAction)
    clearState()
    assertTrue(capture("decline"))
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    assertEquals(
      setOf("schema_version", "thread_id", "call_invite_id", "native_action", "request_key", "capture_generation", "capture_generation_counter", "created_at", "created_elapsed_at"),
      preferences.all.keys,
    )
    assertFalse(preferences.all.keys.any { it.contains("token") || it.contains("credential") || it.contains("media") || it.contains("caller") })
  }

  @Test
  fun malformedUnsupportedAndMismatchedInputsFailClosed() {
    assertFalse(capture(thread = "malformed"))
    assertFalse(capture(invite = "malformed"))
    assertFalse(capture(action = "incoming"))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun duplicateDoesNotExtendOriginalTtlAndReplayIsDenied() {
    assertTrue(capture())
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    val originalElapsed = preferences.getLong("created_elapsed_at", 0L)
    ShadowSystemClock.advanceBy(Duration.ofSeconds(5))
    assertTrue(capture())
    assertEquals(originalElapsed, preferences.getLong("created_elapsed_at", -1L))
    ShadowSystemClock.advanceBy(Duration.ofSeconds(41))
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
    assertTrue(capture())
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    assertFalse(capture())
  }

  @Test
  fun expiredActionIsDeletedAndDenied() {
    assertTrue(capture())
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit()
      .putLong("created_elapsed_at", SystemClock.elapsedRealtime() - 45_001L)
      .commit()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun consumeReturnsExactlyOnce() {
    assertTrue(capture())
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    for (field in listOf("thread_id", "call_invite_id", "native_action", "request_key", "capture_generation", "created_at", "created_elapsed_at")) {
      assertFalse("Pending field must be removed after consume: $field", preferences.contains(field))
    }
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun concurrentConsumeHasOneWinner() {
    assertTrue(capture())
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
  }
}
