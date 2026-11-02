package expo.modules.chillywoodgallerypicker

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
internal data class GalleryContractResult(val canceled: Boolean, val uri: Uri? = null)

internal object GalleryContract {
    fun selectionIntent(kind: String): Intent {
      require(GalleryImportPolicy.supportsKind(kind))
      val collection = if (kind == "video") MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      // An app chooser, not ACTION_PICK_IMAGES. Do not hardcode an OEM/provider.
      // ACTION_PICK does not guarantee a local-only implementation or multi-select.
      return Intent(Intent.ACTION_PICK).setDataAndType(collection, "$kind/*")
    }
  fun createIntent(kind: String): Intent = Intent.createChooser(selectionIntent(kind), "Choose a gallery app")

  fun parseResult(resultCode: Int, intent: Intent?): GalleryContractResult {
    if (resultCode == Activity.RESULT_CANCELED) return GalleryContractResult(canceled = true)
    if (resultCode != Activity.RESULT_OK || intent == null) return GalleryContractResult(canceled = false)
    val uris = mutableSetOf<Uri>()
    intent.data?.let { uris.add(it) }
    intent.clipData?.let { clip ->
      for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let { uris.add(it) }
    }
    // Reject a malformed/multiple response rather than silently dropping media.
    val uri = uris.singleOrNull()?.takeIf { it.scheme == "content" }
    return GalleryContractResult(canceled = false, uri = uri)
  }
}
