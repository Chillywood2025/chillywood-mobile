package com.chillywood.mobile

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
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

  private fun mainIntent() = Intent(Intent.ACTION_MAIN, null, context, MainActivity::class.java).apply {
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private fun lifecycleProbeIntent() = Intent(context, ChillyChatLifecycleProbeActivity::class.java)

  private fun receiverIntent(action: String = "answer") = Intent(
    context,
    ChillyChatCallNotificationActionReceiver::class.java,
  ).apply {
    this.action = if (action == "decline") {
      ChillyChatCallNotifications.ACTION_DECLINE
    } else {
      ChillyChatCallNotifications.ACTION_ANSWER
    }
    putExtra("threadId", threadId)
    putExtra("callInviteId", inviteId)
  }

  private fun dispatchTrusted(action: String = "answer") {
    PendingIntent.getBroadcast(
      context,
      if (action == "decline") 2 else 1,
      receiverIntent(action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    ).send()
    InstrumentationRegistry.getInstrumentation().waitForIdleSync()
  }

  private fun captureTrusted(action: String = "answer") =
    ChillyChatNativeCallActionStore.captureTrustedNotificationAction(context, threadId, inviteId, action)

  @Test
  fun activityCreationCapturesAndConsumesOnce() {
    ActivityScenario.launch<MainActivity>(mainIntent()).use {
      dispatchTrusted()
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun backgroundActionResumesAndConsumesOnce() {
    dispatchTrusted()
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun recreationRetainsPendingAction() {
    assertTrue(captureTrusted())
    ActivityScenario.launch<ChillyChatLifecycleProbeActivity>(lifecycleProbeIntent()).use { scenario ->
      scenario.recreate()
      InstrumentationRegistry.getInstrumentation().waitForIdleSync()
      assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun destroyedActivityRetainsPendingAction() {
    ActivityScenario.launch<ChillyChatLifecycleProbeActivity>(lifecycleProbeIntent()).use { }
    dispatchTrusted()
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    assertNotNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun processColdReceiverPersistsBeforeReactAndConsumesOnce() {
    dispatchTrusted()
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    val action = ChillyChatNativeCallActionStore.consume(context)
    assertEquals("answer", action?.nativeCallAction)
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun receiverBeforeReactContextRetainsAction() {
    dispatchTrusted()
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
    assertEquals(inviteId, ChillyChatNativeCallActionStore.consume(context)?.callInviteId)
  }

  @Test
  fun warmIntentReusesActivityAndCannotReplay() {
    ActivityScenario.launch<MainActivity>(mainIntent()).use {
      dispatchTrusted()
      assertNotNull(ChillyChatNativeCallActionStore.consume(context))
      dispatchTrusted()
      assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
      assertNull(ChillyChatNativeCallActionStore.consume(context))
    }
  }

  @Test
  fun declineForegroundAndCold() {
    dispatchTrusted("decline")
    val action = ChillyChatNativeCallActionStore.consume(context)
    assertEquals("decline", action?.nativeCallAction)
    assertNull(ChillyChatNativeCallActionStore.consume(context))
  }

  @Test
  fun expiredActionRejectedAndDeleted() {
    assertTrue(captureTrusted())
    context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE).edit()
      .putLong("created_elapsed_at", SystemClock.elapsedRealtime() - 45_001L)
      .commit()
    assertNull(ChillyChatNativeCallActionStore.consume(context))
    assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  }

  @Test
  fun explicitReceiverRejectsUnsupportedActionWithoutCrash() {
    val receiverIntent = Intent(context, ChillyChatCallNotificationActionReceiver::class.java).apply {
      action = "invalid.action"
      putExtra("threadId", threadId)
      putExtra("callInviteId", inviteId)
    }
    PendingIntent.getBroadcast(
      context,
      3,
      receiverIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    ).send()
    InstrumentationRegistry.getInstrumentation().waitForIdleSync()
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
        "An external custom-scheme launch must not establish trusted native call action state",
        "empty",
        ChillyChatNativeCallActionStore.readStatus(context),
      )
    }
  }

  @Test
  fun backupPolicyPreflightConfirmedOnInstalledDebugApp() {
    val legacyRules = context.resources.getIdentifier(
      "chillywood_native_call_full_backup_rules",
      "xml",
      context.packageName,
    )
    val modernRules = context.resources.getIdentifier(
      "chillywood_native_call_data_extraction_rules",
      "xml",
      context.packageName,
    )
    assertTrue(legacyRules != 0)
    assertTrue(modernRules != 0)
    assertTrue(captureTrusted())
    assertEquals("present", ChillyChatNativeCallActionStore.readStatus(context))
  }
}
