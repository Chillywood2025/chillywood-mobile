package com.chillywood.mobile

import android.app.Activity
import android.app.Application
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import java.text.SimpleDateFormat
import java.time.Duration
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ActivityController
import org.robolectric.annotation.Config
import org.robolectric.annotation.Implementation
import org.robolectric.annotation.Implements
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowKeyguardManager
import org.robolectric.util.ReflectionHelpers

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
@LooperMode(LooperMode.Mode.PAUSED)
class ChillyChatIncomingCallActivityTest {
  @Implements(KeyguardManager::class)
  class ThrowingUnlockKeyguard : ShadowKeyguardManager() {
    @Implementation(minSdk = 26)
    override fun requestDismissKeyguard(activity: Activity, callback: KeyguardManager.KeyguardDismissCallback) {
      throw IllegalStateException("OS credential UI unavailable")
    }
  }
  @Implements(KeyguardManager::class)
  class LegacyCredentialKeyguard : ShadowKeyguardManager() {
    @Implementation(minSdk = 21, maxSdk = 25)
    fun createConfirmDeviceCredentialIntent(title: CharSequence?, description: CharSequence?): Intent =
      Intent("test.os.credential.prompt")
  }
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val notifications = context.getSystemService(NotificationManager::class.java)
  private val keyguard = context.getSystemService(KeyguardManager::class.java)
  private val controllers = mutableListOf<ActivityController<ChillyChatIncomingCallActivity>>()
  private val invite = "22222222-2222-4222-8222-222222222222"
  private val secondInvite = "33333333-3333-4333-8333-333333333333"
  private val thread = "11111111-1111-4111-8111-111111111111"
  private val nonceKey = "chillywood.invite.presentationNonce"

  @Before
  fun reset() {
    notifications.cancelAll()
    context.getSharedPreferences("chilly_chat_native_call_action_v1", Context.MODE_PRIVATE).edit().clear().commit()
    shadowOf(keyguard).setKeyguardLocked(true)
    shadowOf(keyguard).setIsKeyguardSecure(true)
  }

  @After
  fun destroyActivities() {
    controllers.forEach { it.pause().stop().destroy() }
    notifications.cancelAll()
    shadowOf(Looper.getMainLooper()).idle()
  }

  private fun post(id: String = invite, type: String = "voice", lifetimeMs: Long = 90_000L): Intent {
    val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    ChillyChatCallNotifications.showIncomingCallNotification(context, mapOf(
      "callInviteId" to id, "threadId" to thread, "callType" to type,
      "expiresAt" to date.format(Date(System.currentTimeMillis() + lifetimeMs)),
      "callerName" to "PRIVATE CALLER MUST NOT APPEAR", "body" to "PRIVATE CHAT MUST NOT APPEAR",
    ))
    return Intent(shadowOf(notifications.activeNotifications.single { it.tag == "chilly_chat_call:$id" }.notification.fullScreenIntent).savedIntent)
  }

  private fun open(intent: Intent = post()): ActivityController<ChillyChatIncomingCallActivity> {
    val controller = Robolectric.buildActivity(ChillyChatIncomingCallActivity::class.java, intent).create().start().resume()
    controllers.add(controller)
    return controller
  }

  private fun descendants(view: View): List<View> = listOf(view) + if (view is ViewGroup) (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
  private fun views(activity: Activity) = descendants(activity.findViewById(android.R.id.content))
  private fun button(activity: Activity, text: String) = views(activity).filterIsInstance<Button>().single { it.text.toString() == text }
  private fun emptyAction() = assertEquals("empty", ChillyChatNativeCallActionStore.readStatus(context))
  private fun noLaunch() = assertNull(shadowOf(context as Application).nextStartedActivity)
  // The real generated callback is retained at the mocked OS boundary. Tests
  // can deliver an old callback without fabricating any app state or authority.
  private fun heldUnlockCallback(): KeyguardManager.KeyguardDismissCallback =
    ReflectionHelpers.getStaticField(ShadowKeyguardManager::class.java, "callback")

  @Test
  fun fullScreenPendingIntentTargetsPrivateCallActivityAndContentStillTargetsOrdinaryApp() {
    val intent = post()
    val notification = notifications.activeNotifications.single().notification
    assertEquals(ChillyChatIncomingCallActivity::class.java.name, intent.component?.className)
    assertEquals(Activity::class.java.name, shadowOf(notification.contentIntent).savedIntent.component?.className)
    val info = context.packageManager.getActivityInfo(ComponentName(context, ChillyChatIncomingCallActivity::class.java), 0)
    assertFalse(info.exported)
    assertTrue(info.flags and android.content.pm.ActivityInfo.FLAG_EXCLUDE_FROM_RECENTS != 0)
    assertEquals("", info.taskAffinity ?: "")
    val other = post(secondInvite)
    assertNotEquals(intent.data, other.data)
    emptyAction()
  }

  @Test
  fun validCallShowsOnlyGenericControlsAboveKeyguardWithoutUnlockingOrLaunchingMedia() {
    val activity = open(post(type = "video")).get()
    assertTrue(shadowOf(activity).showWhenLocked)
    assertTrue(shadowOf(activity).turnScreenOn)
    assertTrue(keyguard.isKeyguardLocked)
    val texts = views(activity).filterIsInstance<TextView>().map { it.text.toString() }
    assertTrue(texts.contains("Incoming Chi'lly Chat video call"))
    assertFalse(texts.any { it.contains("PRIVATE") })
    assertTrue(button(activity, "Answer").isEnabled)
    assertTrue(button(activity, "Decline").isEnabled)
    emptyAction()
    noLaunch()
  }

  @Test
  @Config(sdk = [25])
  fun olderSupportedAndroidUsesOnlyDisplayFlagsAndKeepsKeyguardLocked() {
    val activity = open().get()
    assertTrue(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED != 0)
    assertTrue(activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON != 0)
    assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
    assertTrue(keyguard.isKeyguardLocked)
    emptyAction()
    noLaunch()
  }

  @Test
  @Config(sdk = [25], shadows = [LegacyCredentialKeyguard::class])
  fun legacyCredentialResultRequiresSuccessfulUnlockBeforeExistingActionHandoff() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    val request = shadowOf(activity).nextStartedActivityForResult
    assertEquals("test.os.credential.prompt", request.intent.action)
    emptyAction()
    shadowOf(keyguard).setKeyguardLocked(false)
    shadowOf(activity).callOnActivityResult(request.requestCode, Activity.RESULT_OK, null)
    assertEquals("answer", ChillyChatNativeCallActionStore.consume(context)?.nativeCallAction)
    assertTrue(activity.isFinishing)
  }

  @Test
  @Config(sdk = [25], shadows = [LegacyCredentialKeyguard::class])
  fun legacyCancelledAndStaleCredentialResultsCannotAnswerReplacement() {
    val controller = open()
    button(controller.get(), "Answer").performClick()
    val cancelled = shadowOf(controller.get()).nextStartedActivityForResult
    shadowOf(controller.get()).callOnActivityResult(cancelled.requestCode, Activity.RESULT_CANCELED, null)
    assertTrue(button(controller.get(), "Answer").isEnabled)
    emptyAction()
    button(controller.get(), "Answer").performClick()
    val old = shadowOf(controller.get()).nextStartedActivityForResult
    controller.newIntent(post(secondInvite))
    button(controller.get(), "Decline").performClick()
    val current = shadowOf(controller.get()).nextStartedActivityForResult
    assertNotEquals(old.requestCode, current.requestCode)
    shadowOf(keyguard).setKeyguardLocked(false)
    shadowOf(controller.get()).callOnActivityResult(old.requestCode, Activity.RESULT_OK, null)
    emptyAction()
    shadowOf(controller.get()).callOnActivityResult(current.requestCode, Activity.RESULT_OK, null)
    val captured = ChillyChatNativeCallActionStore.consume(context)
    assertEquals(secondInvite, captured?.callInviteId)
    assertEquals("decline", captured?.nativeCallAction)
  }

  @Test
  @Config(sdk = [25], shadows = [LegacyCredentialKeyguard::class])
  fun recreatedLegacyActivityCannotReuseOldCredentialResultForNewAction() {
    val controller = open()
    button(controller.get(), "Answer").performClick()
    val old = shadowOf(controller.get()).nextStartedActivityForResult
    controller.recreate()
    controller.newIntent(post(secondInvite))
    button(controller.get(), "Decline").performClick()
    assertNull(shadowOf(controller.get()).nextStartedActivityForResult)
    shadowOf(keyguard).setKeyguardLocked(false)
    shadowOf(controller.get()).callOnActivityResult(old.requestCode, Activity.RESULT_OK, null)
    emptyAction()
    // A fresh explicit tap after the owner manually unlocks still works.
    button(controller.get(), "Decline").performClick()
    assertEquals(secondInvite, ChillyChatNativeCallActionStore.consume(context)?.callInviteId)
  }

  @Test
  fun missingOrWrongInviteThreadNonceCannotDisplayOrCreateAction() {
    val valid = post()
    val bad = listOf(Intent(context, ChillyChatIncomingCallActivity::class.java),
      Intent(valid).putExtra("callInviteId", secondInvite),
      Intent(valid).putExtra("threadId", secondInvite),
      Intent(valid).putExtra(nonceKey, secondInvite),
      Intent(valid).putExtra("callInviteId", "malformed"))
    bad.forEach {
      val activity = open(it).get()
      assertTrue(activity.isFinishing)
      assertFalse(shadowOf(activity).showWhenLocked)
      emptyAction()
    }
    noLaunch()
  }

  @Test
  fun removedNotificationAndOldPendingIntentCannotReopenPresentation() {
    val old = post()
    ChillyChatCallNotifications.clearIncomingCallNotification(context, invite)
    assertTrue(open(old).get().isFinishing)
    val replacement = post()
    assertNotEquals(old.getStringExtra(nonceKey), replacement.getStringExtra(nonceKey))
    assertTrue(open(old).get().isFinishing)
    assertFalse(open(replacement).get().isFinishing)
    emptyAction()
  }

  @Test
  fun expiredPresentationCannotDisplayOrHandOff() {
    val intent = post(lifetimeMs = 1_000)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2))
    assertTrue(open(intent).get().isFinishing)
    emptyAction()
    noLaunch()
  }

  @Test
  fun bothUserActionsWaitForNormalUnlockThenUseExactlyOneExistingActionStoreHandoff() {
    for (action in listOf("Answer", "Decline")) {
      context.getSharedPreferences("chilly_chat_native_call_action_v1", Context.MODE_PRIVATE).edit().clear().commit()
      shadowOf(keyguard).setKeyguardLocked(true)
      val activity = open().get()
      button(activity, action).performClick()
      assertFalse(button(activity, "Answer").isEnabled)
      assertFalse(button(activity, "Decline").isEnabled)
      emptyAction()
      noLaunch()
      val callback = heldUnlockCallback()
      shadowOf(keyguard).setKeyguardLocked(false)
      val captured = ChillyChatNativeCallActionStore.consume(context)
      assertEquals(action.lowercase(), captured?.nativeCallAction)
      assertEquals(invite, captured?.callInviteId)
      assertEquals(thread, captured?.threadId)
      assertEquals(Intent.ACTION_MAIN, shadowOf(context as Application).nextStartedActivity?.action)
      assertTrue(activity.isFinishing)
      callback.onDismissSucceeded()
      emptyAction()
      noLaunch()
    }
  }

  @Test
  fun cancelledUnlockDoesNotCreateActionAndAllowsRetry() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    shadowOf(keyguard).setKeyguardLocked(true)
    assertTrue(button(activity, "Answer").isEnabled)
    assertTrue(button(activity, "Decline").isEnabled)
    assertFalse(activity.isFinishing)
    emptyAction()
    noLaunch()
  }

  @Test
  @Config(shadows = [ThrowingUnlockKeyguard::class])
  fun unavailableCredentialUiReleasesOnlyPendingActionAndDoesNotCrash() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    assertTrue(button(activity, "Answer").isEnabled)
    assertTrue(button(activity, "Decline").isEnabled)
    assertFalse(activity.isFinishing)
    emptyAction()
    noLaunch()
  }

  @Test
  fun callbackClaimingSuccessWhileStillLockedCannotCreateAction() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    heldUnlockCallback().onDismissSucceeded()
    emptyAction()
    noLaunch()
    assertTrue(keyguard.isKeyguardLocked)
  }

  @Test
  fun previousUnlockAttemptCannotConsumeNewAttemptForSamePresentation() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    val oldCallback = heldUnlockCallback()
    shadowOf(keyguard).setKeyguardLocked(true)
    button(activity, "Answer").performClick()
    val currentCallback = heldUnlockCallback()
    // Make the OS state unlocked without delivering the current callback yet.
    ReflectionHelpers.setStaticField(ShadowKeyguardManager::class.java, "callback", null)
    shadowOf(keyguard).setKeyguardLocked(false)
    oldCallback.onDismissSucceeded()
    emptyAction()
    noLaunch()
    currentCallback.onDismissSucceeded()
    assertEquals("answer", ChillyChatNativeCallActionStore.consume(context)?.nativeCallAction)
  }

  @Test
  fun newIntentDuringUnlockInvalidatesOldCallbackAndDoesNotActOnReplacement() {
    val controller = open()
    button(controller.get(), "Answer").performClick()
    val callback = heldUnlockCallback()
    val replacement = post(secondInvite, "video")
    controller.newIntent(replacement)
    shadowOf(keyguard).setKeyguardLocked(false)
    callback.onDismissSucceeded()
    assertFalse(controller.get().isFinishing)
    emptyAction()
    noLaunch()
    button(controller.get(), "Decline").performClick()
    assertEquals(secondInvite, ChillyChatNativeCallActionStore.consume(context)?.callInviteId)
  }

  @Test
  fun staleNewIntentCannotDismissNewerPresentationOrDisturbItsPendingUnlock() {
    val old = post()
    val controller = open(old)
    ChillyChatCallNotifications.clearIncomingCallNotification(context, invite)
    val replacement = post(secondInvite, "video")
    controller.newIntent(replacement)
    button(controller.get(), "Answer").performClick()
    controller.newIntent(old)
    assertFalse(controller.get().isFinishing)
    assertEquals(replacement.data, controller.get().intent.data)
    assertFalse(button(controller.get(), "Answer").isEnabled)
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(controller.get().isFinishing)
    shadowOf(keyguard).setKeyguardLocked(false)
    assertEquals(secondInvite, ChillyChatNativeCallActionStore.consume(context)?.callInviteId)
  }

  @Test
  fun terminalDuringUnlockClosesImmediatelyAndLateSuccessDoesNotAct() {
    val activity = open().get()
    // Drain the initial check while valid; a matching clear must close via its
    // listener now, without waiting for the next 500ms fallback recheck.
    shadowOf(Looper.getMainLooper()).idle()
    button(activity, "Answer").performClick()
    ChillyChatCallNotifications.handleNativeTerminalCall(context, mapOf(
      "nativeCallStyle" to "terminal", "dismissCall" to "true", "action" to "cancel", "callInviteId" to invite, "threadId" to thread,
    ))
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue(activity.isFinishing)
    shadowOf(keyguard).setKeyguardLocked(false)
    emptyAction()
    noLaunch()
  }

  @Test
  fun removalDuringCredentialUiIsRecheckedBeforeAnyActionWithoutListenerDelivery() {
    val activity = open().get()
    button(activity, "Answer").performClick()
    notifications.cancelAll()
    shadowOf(keyguard).setKeyguardLocked(false)
    emptyAction()
    noLaunch()
  }

  @Test
  fun deadlineDuringCredentialUiIsRecheckedBeforeAnyActionWithoutTimerDelivery() {
    val activity = open(post(lifetimeMs = 1_000)).get()
    button(activity, "Decline").performClick()
    org.robolectric.shadows.ShadowSystemClock.advanceBy(Duration.ofSeconds(2))
    shadowOf(keyguard).setKeyguardLocked(false)
    emptyAction()
    noLaunch()
  }

  @Test
  fun otherCallClearAndQueuedOldNonceClearCannotCloseReplacement() {
    val original = post()
    val controller = open(original)
    val other = post(secondInvite)
    ChillyChatCallNotifications.clearIncomingCallNotification(context, secondInvite)
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(controller.get().isFinishing)
    ChillyChatCallNotifications.clearIncomingCallNotification(context, invite)
    val replacement = post()
    controller.newIntent(replacement)
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(controller.get().isFinishing)
    assertNull(ChillyChatCallNotifications.readIncomingPresentation(context, other))
    emptyAction()
    noLaunch()
  }

  @Test
  fun originalDeadlineClosesUiWithoutDeclineAndRedeliveryCannotExtendIt() {
    val first = post(lifetimeMs = 2_000)
    val activity = open(first).get()
    val duplicate = post(lifetimeMs = 90_000)
    assertEquals(first.getStringExtra(nonceKey), duplicate.getStringExtra(nonceKey))
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(3))
    assertTrue(activity.isFinishing)
    emptyAction()
    noLaunch()
  }

  @Test
  fun externalNotificationRemovalClosesOnBoundedRecheck() {
    val activity = open().get()
    notifications.cancelAll()
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofMillis(501))
    assertTrue(activity.isFinishing)
    emptyAction()
    noLaunch()
  }

  @Test
  fun backOnlyClosesUiAndDoesNotManufactureDecline() {
    val activity = open().get()
    activity.onBackPressed()
    assertTrue(activity.isFinishing)
    assertEquals(1, notifications.activeNotifications.size)
    emptyAction()
    noLaunch()
  }

  @Test
  fun destroyedActivityCannotConsumeLateUnlockOrCloseReplacement() {
    val controller = open()
    button(controller.get(), "Answer").performClick()
    val callback = heldUnlockCallback()
    controller.pause().stop().destroy()
    controllers.remove(controller)
    ChillyChatCallNotifications.clearIncomingCallNotification(context, invite)
    val replacement = open(post()).get()
    shadowOf(keyguard).setKeyguardLocked(false)
    callback.onDismissSucceeded()
    shadowOf(Looper.getMainLooper()).idle()
    assertFalse(replacement.isFinishing)
    emptyAction()
    noLaunch()
  }
}
