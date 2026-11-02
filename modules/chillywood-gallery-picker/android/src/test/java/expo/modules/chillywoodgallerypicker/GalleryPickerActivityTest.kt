package expo.modules.chillywoodgallerypicker

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.net.Uri
import android.os.Bundle
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

/** Hosted Android SDK test of the actual proxy Activity, not an Expo launcher mock. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@LooperMode(LooperMode.Mode.PAUSED)
class GalleryPickerActivityTest {
  private fun intent(id: String) = Intent().putExtra(GalleryPickerActivity.REQUEST_ID, id)
    .putExtra(GalleryPickerActivity.MEDIA_KIND, "image")
  private fun request(id: String) = GalleryRequest<GalleryContractResult>(id, 1).also { GalleryActivityRegistry.register(it) }

  @Test fun missingProcessOwnershipFinishesWithoutRelaunch() {
    val controller = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent("absent")).create()
    assertTrue(controller.get().isFinishing)
    assertNull(shadowOf(controller.get()).nextStartedActivityForResult)
    controller.destroy()
  }

  @Test fun retirementBeforeProxyCreationNeverLaunchesExternalChooser() {
    val request = request("retired-before-create"); request.cancel()
    val controller = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create()
    assertTrue(request.result.get().canceled)
    assertNull(shadowOf(controller.get()).nextStartedActivityForResult)
    GalleryActivityRegistry.finish(request, false); controller.destroy()
    assertNull(GalleryActivityRegistry.get(request.id))
  }

  @Test fun recreationKeepsExactRequestAndDoesNotRelaunchThenSettlesActualCancel() {
    val request = request("recreate")
    val first = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create().start().resume()
    assertNotNull(shadowOf(first.get()).nextStartedActivityForResult)
    val saved = Bundle(); first.saveInstanceState(saved).pause().stop().destroy()
    assertFalse(request.result.isDone)
    val second = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create(saved).start().resume()
    assertNull(shadowOf(second.get()).nextStartedActivityForResult)
    // Dispatch the platform callback to the real Activity after recreation.
    GalleryPickerActivity::class.java.getDeclaredMethod("onActivityResult", Int::class.javaPrimitiveType, Int::class.javaPrimitiveType, Intent::class.java)
      .apply { isAccessible = true }
      .invoke(second.get(), 1, Activity.RESULT_CANCELED, null)
    assertTrue(request.result.get().canceled)
    assertFalse(second.get().isFinishing)
    val dismissal = GalleryActivityRegistry.finish(request, false)
    assertTrue(second.get().isFinishing); assertFalse(dismissal.isDone)
    second.pause().stop().destroy(); assertTrue(dismissal.isDone)
    assertNull(GalleryActivityRegistry.get(request.id))
  }

  @Test fun finishingBetweenOldDestroyAndReplacementAttachFinishesReplacement() {
    val request = request("attach-race")
    val old = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create()
    val saved = Bundle(); old.saveInstanceState(saved).destroy()
    val dismissal = GalleryActivityRegistry.finish(request, false)
    assertFalse(dismissal.isDone)
    val replacement = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create(saved)
    assertTrue(replacement.get().isFinishing)
    assertNull(shadowOf(replacement.get()).nextStartedActivityForResult)
    replacement.destroy(); assertTrue(dismissal.isDone)
  }

  @Test fun retiringRequestDoesNotReleaseOpenChooserOrLetDifferentRequestTakeOwnership() {
    val request = request("retire")
    val controller = Robolectric.buildActivity(GalleryPickerActivity::class.java, intent(request.id)).create()
    request.cancel(); assertFalse(request.result.isDone); assertFalse(controller.get().isFinishing)
    try { request("competing"); fail("global native ownership was released") } catch (_: IllegalStateException) { }
    request.settle(request.id, GalleryContractResult(canceled = false, uri = Uri.parse("content://media/1")))
    assertTrue(request.canceled.get()) // Returned URI never revives retired authority.
    GalleryActivityRegistry.finish(request, false); controller.destroy()
    assertNull(GalleryActivityRegistry.get(request.id))
  }

  @Test fun staleIdCannotSettleAnotherRequestAndLaunchFailureRemovesOwnership() {
    val old = request("failed-launch")
    assertFalse(old.settle("wrong", GalleryContractResult(canceled = true)))
    assertFalse(old.result.isDone)
    assertTrue(GalleryActivityRegistry.finish(old, true).isDone)
    val next = request("next")
    assertFalse(next.result.isDone)
    assertTrue(GalleryActivityRegistry.finish(next, true).isDone)
  }

  @Test fun contractUsesRequestedCollectionAndNoProviderPackageOrBroadGrant() {
    val image = GalleryContract.selectionIntent("image")
    assertEquals(Intent.ACTION_PICK, image.action); assertEquals("image/*", image.type)
    assertEquals("content://media/external/images/media", image.data.toString())
    assertNull(image.`package`); assertNull(image.component)
    assertEquals("video/*", GalleryContract.selectionIntent("video").type)
    assertEquals(Intent.ACTION_CHOOSER, GalleryContract.createIntent("image").action)
  }

  @Test fun invalidOrMultipleProviderResultsAreNotSilentlyAccepted() {
    assertTrue(GalleryContract.parseResult(Activity.RESULT_CANCELED, null).canceled)
    assertNull(GalleryContract.parseResult(Activity.RESULT_OK, Intent().setData(Uri.parse("file:///private"))).uri)
    val first = Uri.parse("content://media/1")
    val data = Intent().setData(first).apply {
      clipData = ClipData.newRawUri("selection", first).apply { addItem(ClipData.Item(Uri.parse("content://media/2"))) }
    }
    assertNull(GalleryContract.parseResult(Activity.RESULT_OK, data).uri)
    assertEquals(first, GalleryContract.parseResult(Activity.RESULT_OK, Intent().setData(first)).uri)
  }
}
