package expo.modules.imagepicker.contracts

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.imagepicker.ImagePickerOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.activityresult.AppContextActivityResultRetention
import expo.modules.kotlin.providers.AppContextProvider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Compiles and executes the actual two internal vendor contracts, not copies. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], manifest = Config.NONE)
class ImagePickerContractRetentionTest {
  private val unavailableProvider = object : AppContextProvider {
    override val appContext: AppContext get() = throw SecurityException("provider unavailable sentinel")
  }

  @Test fun onlyNonEditingCameraAndLibraryInputsOptIn() {
    for (editing in listOf(false, true)) {
      val options = ImagePickerOptions().apply { allowsEditing = editing }
      assertEquals(!editing, CameraContract(unavailableProvider).shouldRetainCallbackOnHostDestroy(CameraContractOptions("content://fixture/asset", options)))
      assertEquals(!editing, ImageLibraryContract(unavailableProvider).shouldRetainCallbackOnHostDestroy(ImageLibraryContractOptions(options)))
      assertFalse((CropImageContract(unavailableProvider) as Any) is AppContextActivityResultRetention<*>)
    }
  }

  @Test fun canceledResultNeedsNoProviderAndReturnsCancellation() {
    val options = ImagePickerOptions()
    assertEquals(ImagePickerContractResult.Cancelled, CameraContract(unavailableProvider).parseResult(CameraContractOptions("content://fixture/asset", options), Activity.RESULT_CANCELED, null))
    assertEquals(ImagePickerContractResult.Cancelled, ImageLibraryContract(unavailableProvider).parseResult(ImageLibraryContractOptions(options), Activity.RESULT_CANCELED, null))
  }

  @Test fun noEditProviderFailureReturnsErrorToOriginalContinuation() {
    val options = ImagePickerOptions()
    assertEquals(ImagePickerContractResult.Error, CameraContract(unavailableProvider).parseResult(CameraContractOptions("content://fixture/asset", options), Activity.RESULT_OK, null))
    val data = Intent().setData(Uri.parse("content://fixture/asset"))
    assertEquals(ImagePickerContractResult.Error, ImageLibraryContract(unavailableProvider).parseResult(ImageLibraryContractOptions(options), Activity.RESULT_OK, data))
  }

  @Test fun editingProviderFailureKeepsUpstreamBehavior() {
    val options = ImagePickerOptions().apply { allowsEditing = true }
    val actions = listOf<() -> Unit>(
      { CameraContract(unavailableProvider).parseResult(CameraContractOptions("content://fixture/asset", options), Activity.RESULT_OK, null) },
      { ImageLibraryContract(unavailableProvider).parseResult(ImageLibraryContractOptions(options), Activity.RESULT_OK, Intent().setData(Uri.parse("content://fixture/asset"))) }
    )
    for (action in actions) {
      try { action(); fail("Editing exception should remain upstream behavior") }
      catch (expected: SecurityException) { assertEquals("provider unavailable sentinel", expected.message) }
    }
  }
}
