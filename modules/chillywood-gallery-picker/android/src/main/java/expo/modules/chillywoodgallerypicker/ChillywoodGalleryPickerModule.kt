package expo.modules.chillywoodgallerypicker

import android.net.Uri
import android.content.Intent
import android.os.CancellationSignal
import android.provider.OpenableColumns
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.Locale
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal class GalleryPickerOptions : Record {
  @Field var mediaKind: String = "image"
  @Field var maximumBytes: Long = 250L * 1024 * 1024
  @Field var heicMaximumBytes: Long = 0
  @Field var requestId: String = ""
}

class ChillywoodGalleryPickerModule : Module() {
  private val activeRequest = AtomicReference<GalleryRequest<GalleryContractResult>?>(null)
  private val lifecycleGeneration = AtomicLong(0)
  private val ownedSelections = GalleryProcessCache.selections

  override fun definition() = ModuleDefinition {
    Name("ChillywoodGalleryPicker")
    Function("capabilities") { kind: String ->
      val context = appContext.reactContext
      val available = context != null && GalleryImportPolicy.supportsKind(kind) &&
        GalleryContract.selectionIntent(kind).resolveActivity(context.packageManager) != null
      mapOf("apiVersion" to 1, "available" to available, "maximumSelection" to 1, "localOnly" to false,
        "reason" to if (available) null else "no_gallery_handler")
    }
    AsyncFunction("launchGalleryAsync") Coroutine { options: GalleryPickerOptions ->
      if (!GalleryImportPolicy.supportsKind(options.mediaKind) || options.maximumBytes < 1 || options.maximumBytes > GalleryImportPolicy.MAXIMUM_BYTES || options.heicMaximumBytes !in 0..GalleryImportPolicy.MAXIMUM_HEIC_IMPORT_BYTES || options.requestId.length !in 1..128) {
        throw CodedException("GALLERY_INVALID_OPTIONS", "This gallery request is not supported.", null)
      }
      val activity = appContext.currentActivity
      if (activity == null || activity.isFinishing || activity.isDestroyed) {
        throw CodedException("GALLERY_ACTIVITY_UNAVAILABLE", "Return to the app before choosing media.", null)
      }
      if (GalleryContract.selectionIntent(options.mediaKind).resolveActivity(activity.packageManager) == null) {
        throw CodedException("GALLERY_UNAVAILABLE", "No installed gallery app supports this selection. Choose the system photo library or Files.", null)
      }
      val request = GalleryRequest<GalleryContractResult>(options.requestId, lifecycleGeneration.get())
      if (!activeRequest.compareAndSet(null, request)) {
        throw CodedException("GALLERY_BUSY", "Finish choosing the current attachment first.", null)
      }
      // Module coroutine cancellation must not abandon an open native Activity
      // or an importing writer. Lifecycle callbacks retire authority; the real
      // Activity result and finished import still own the lease to completion.
      withContext(NonCancellable) {
        var launchFailed = true
        val selection = try {
          try { GalleryActivityRegistry.register(request) } catch (_: IllegalStateException) {
            throw CodedException("GALLERY_BUSY", "Finish choosing the current attachment first.", null)
          }
          withContext(Dispatchers.Main) {
            activity.startActivity(Intent(activity, GalleryPickerActivity::class.java)
              .putExtra(GalleryPickerActivity.REQUEST_ID, request.id)
              .putExtra(GalleryPickerActivity.MEDIA_KIND, options.mediaKind))
            launchFailed = false
          }
          val result = awaitCompletion(request.result)
          if (result.canceled || request.canceled.get() || lifecycleGeneration.get() != request.generation) {
            mapOf("canceled" to true)
          } else {
            val uri = result.uri ?: throw CodedException("GALLERY_INVALID_RESULT", "The gallery did not return a readable single attachment. Choose another file.", null)
            withContext(Dispatchers.IO) { importSelection(uri, options, request) }
          }
        } finally {
          // No timeout/background callback releases an open picker or import.
          awaitCompletion(GalleryActivityRegistry.finish(request, launchFailed))
          activeRequest.compareAndSet(request, null)
        }
        if (request.canceled.get() || lifecycleGeneration.get() != request.generation) {
          (selection["selectionId"] as? String)?.let { ownedSelections.remove(it)?.delete() }
          mapOf("canceled" to true)
        } else {
          selection
        }
      }
    }
    AsyncFunction("cancelRequestAsync") { requestId: String ->
      activeRequest.get()?.takeIf { it.id == requestId }?.cancel()
      Unit
    }
    AsyncFunction("discardSelectionAsync") { selectionId: String ->
      // Only opaque IDs issued by this module can delete its own cached imports.
      ownedSelections.remove(selectionId)?.delete()
      Unit
    }
    OnActivityDestroys { lifecycleGeneration.incrementAndGet(); activeRequest.get()?.cancel() }
    OnDestroy { lifecycleGeneration.incrementAndGet(); activeRequest.get()?.cancel() }
  }

  private suspend fun <T> awaitCompletion(future: CompletableFuture<T>): T = suspendCancellableCoroutine { continuation ->
    future.whenComplete { value, error ->
      if (continuation.isActive) {
        if (error != null) continuation.resumeWithException(error) else continuation.resume(value)
      }
    }
  }

  private fun importSelection(uri: Uri, options: GalleryPickerOptions, request: GalleryRequest<GalleryContractResult>): Map<String, Any> {
    val resolver = appContext.reactContext?.contentResolver
      ?: throw CodedException("GALLERY_ACTIVITY_UNAVAILABLE", "Return to the app and choose the attachment again.", null)
    val directory = GalleryProcessCache.directory(appContext.cacheDirectory)
    val selectionId = UUID.randomUUID().toString()
    var output: File? = null
    var name: String? = null
    var declaredSize: Long? = null
    var mime: String? = null
    val cancellation = CancellationSignal()
    val control = GalleryImportControl({ cancellation.cancel() }, 60_000)
    request.importer.set(control)
    if (request.canceled.get()) control.requestCancel("GALLERY_RETIRED")
    try {
      val retained = directory.listFiles()?.filter { it.isFile } ?: emptyList()
      val remaining = GalleryImportPolicy.remainingCacheBytes(retained.sumOf { it.length() }, retained.size)
      if (!control.isCurrent) throw IOException(control.reason())
      // getType has no CancellationSignal overload. Request MIME alongside
      // metadata through the cancellable query instead; unsupported columns get
      // one openable-metadata retry, not an uncancellable provider call.
      val cursor = try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, MediaStore.MediaColumns.MIME_TYPE), null, null, null, cancellation)
      } catch (_: IllegalArgumentException) {
        cancellation.throwIfCanceled()
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null, cancellation)
      }
      cursor?.use { currentCursor ->
        if (currentCursor.moveToFirst()) {
          val nameIndex = currentCursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = currentCursor.getColumnIndex(OpenableColumns.SIZE)
          val mimeIndex = currentCursor.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)
          if (nameIndex >= 0 && !currentCursor.isNull(nameIndex)) name = currentCursor.getString(nameIndex)
          if (sizeIndex >= 0 && !currentCursor.isNull(sizeIndex)) declaredSize = currentCursor.getLong(sizeIndex)
          if (mimeIndex >= 0 && !currentCursor.isNull(mimeIndex)) mime = currentCursor.getString(mimeIndex)?.lowercase(Locale.ROOT)
        }
      }
      if (!control.isCurrent) throw IOException(control.reason())
      val inferredMime = mime ?: GalleryImportPolicy.inferMimeFromName(name)
      val maximumBytes = minOf(GalleryImportPolicy.maximumImportBytes(options.maximumBytes, options.heicMaximumBytes, inferredMime), remaining)
      if (!GalleryImportPolicy.acceptsMime(options.mediaKind, inferredMime)) {
        throw CodedException("GALLERY_WRONG_TYPE", "The gallery did not identify a supported attachment type. Try the system photo library or Files.", null)
      }
      val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(inferredMime) ?: "media"
      val ownedOutput = File(directory, "$selectionId.$extension")
      output = ownedOutput
      if (declaredSize != null && declaredSize!! > maximumBytes) {
        throw CodedException("GALLERY_TOO_LARGE", "This attachment is too large to import. Choose a smaller file.", null)
      }
      val size = resolver.openAssetFileDescriptor(uri, "r", cancellation)?.use { descriptor ->
        descriptor.createInputStream().use { input ->
          control.attach(input)
          try {
            ownedOutput.outputStream().use { stream ->
              GalleryImportPolicy.copy(input, stream, maximumBytes) { control.isCurrent && !request.canceled.get() && lifecycleGeneration.get() == request.generation }
            }
          } finally { control.detach(input) }
        }
      } ?: throw CodedException("GALLERY_UNREADABLE", "The gallery did not grant access to this attachment. Try the system photo library or Files.", null)
      if (!control.isCurrent || request.canceled.get() || lifecycleGeneration.get() != request.generation) {
        ownedOutput.delete()
        return mapOf("canceled" to true)
      }
      ownedSelections[selectionId] = ownedOutput
      val asset = mutableMapOf<String, Any>("uri" to Uri.fromFile(ownedOutput).toString(), "name" to (name ?: ownedOutput.name), "size" to size)
      // If the provider omitted MIME, retain that fact; filename inference is
      // only a validation aid, never invented native JPEG metadata.
      mime?.let { asset["mimeType"] = it }
      return mapOf("canceled" to false, "selectionId" to selectionId,
        "asset" to asset)
    } catch (error: Exception) {
      output?.delete()
      if (request.canceled.get() || lifecycleGeneration.get() != request.generation) return mapOf("canceled" to true)
      if (control.reason() == "GALLERY_IMPORT_TIMEOUT") throw CodedException("GALLERY_IMPORT_TIMEOUT", "The gallery took too long to import this attachment. Download it to the device or choose Files, then try again.", null)
      if (error is CodedException) throw error
      if (error.message == "GALLERY_CACHE_FULL") throw CodedException("GALLERY_CACHE_FULL", "The gallery import cache is full. Finish or discard pending selections, or choose Files.", null)
      if (error.message == "GALLERY_TOO_LARGE") throw CodedException("GALLERY_TOO_LARGE", "This attachment is too large to import. Choose a smaller file.", null)
      throw CodedException("GALLERY_IMPORT_FAILED", "The gallery attachment could not be imported. Download it to the device or choose Files, then try again.", null)
    } finally {
      // This only runs after the actual reader/writer exited. A cancellation
      // deadline never returns a result while a background writer still runs.
      control.close()
      request.importer.compareAndSet(control, null)
    }
  }
}
