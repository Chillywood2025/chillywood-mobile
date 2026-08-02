package com.chillywood.mobile

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ChillyChatNativeLifecycleInstrumentationTest {
  private val context: Context
    get() = InstrumentationRegistry.getInstrumentation().targetContext
  private val preferencesName = "chilly_chat_native_call_action_v1"
  private val threadId = "11111111-1111-4111-8111-111111111111"
  private val inviteId = "22222222-2222-4222-8222-222222222222"

  @Before
  fun clearState() {
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit().clear().commit()
  }

  private fun actionIntent(action: String = "answer") = Intent(
    Intent.ACTION_VIEW,
    Uri.parse("chillywoodmobile://chat/$threadId?callInviteId=$inviteId&nativeCallAction=$action"),
    context,
    MainActivity::class.java,
  ).apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    putExtra("threadId", threadId)
    putExtra("callInviteId", inviteId)
    putExtra("nativeCallAction", action)
  }

  @Test
  fun activityCreationCapturesAndConsumesOnce() {
    ActivityScenario.launch<MainActivity>(actionIntent()).use {
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun warmIntentReusesActivityAndCannotReplay() {
    ActivityScenario.launch<MainActivity>(Intent(context, MainActivity::class.java)).use { scenario ->
      scenario.onActivity { activity -> activity.startActivity(actionIntent()) }
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      assertFalse(ChillyChatNativeCallActionStore.capture(context, actionIntent()))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun recreationRetainsPendingAction() {
    ActivityScenario.launch<MainActivity>(actionIntent()).use { scenario ->
      scenario.recreate()
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun explicitReceiverRejectsUnsupportedActionWithoutCrash() {
    val receiverIntent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = "invalid.action"
      putExtra("threadId", threadId)
      putExtra("callInviteId", inviteId)
    }
    ChillyChatCallNotificationActionReceiver().onReceive(context, receiverIntent)
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun verifyExternallyLaunchedActionWasNotPersisted() {
    val externalIntent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("chillywoodmobile://chat/$threadId?callInviteId=$inviteId&nativeCallAction=answer"),
    ).apply {
      addCategory(Intent.CATEGORY_BROWSABLE)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    ActivityScenario.launch<MainActivity>(externalIntent).use {
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertEquals(
        "empty",
        ChillyChatNativeCallActionStore.readStatus(context),
        "An external custom-scheme launch must not establish trusted native call action state",
      )
    }
  }

  @Test
  fun consumeColdActionExactlyOnce() {
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }
}
