package expo.modules.chillywoodgallerypicker

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicReference

/** Owns OS result delivery independently of Expo54's recreated-host registry. */
class GalleryPickerActivity : Activity() {
  companion object {
    private const val PICK_REQUEST = 1 // Private to this Activity, no RN request-code collision.
    const val REQUEST_ID = "gallery_request_id"
    const val MEDIA_KIND = "gallery_media_kind"
    private const val LAUNCHED = "gallery_launched"
  }
  private var requestId: String? = null
  private var launched = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val id = (savedInstanceState?.getString(REQUEST_ID) ?: intent.getStringExtra(REQUEST_ID))
      ?: run { finish(); return }
    requestId = id
    val entry = GalleryActivityRegistry.get(id)
    // Process death loses the account-owned registry. Never relaunch or replay.
    if (entry == null) { finish(); return }
    if (!GalleryActivityRegistry.attach(id, this)) return
    launched = savedInstanceState?.getBoolean(LAUNCHED) ?: false
    showImportProgress(entry.request)
    if (entry.request.result.isDone) return // Recreation during import keeps its URI grant/task alive.
    if (!launched) {
      if (entry.request.canceled.get()) {
        entry.request.settle(id, GalleryContractResult(canceled = true))
        return
      }
      launched = true
      try {
        startActivityForResult(GalleryContract.createIntent(intent.getStringExtra(MEDIA_KIND) ?: "image"), PICK_REQUEST)
      } catch (_: Exception) {
        entry.request.settle(id, GalleryContractResult(canceled = false))
      }
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    outState.putString(REQUEST_ID, requestId)
    outState.putBoolean(LAUNCHED, launched)
    super.onSaveInstanceState(outState)
  }

  @Deprecated("Platform callback required for this isolated Activity result owner")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != PICK_REQUEST) return
    val id = requestId ?: return
    val request = GalleryActivityRegistry.get(id)?.request ?: run { finish(); return }
    request.settle(id, GalleryContract.parseResult(resultCode, data))
    // Do not finish here: the receiving Activity retains the temporary grant
    // through import. Module finally removes the exact registry entry and finishes.
  }

  @Deprecated("Cancel import without abandoning its owned writer")
  override fun onBackPressed() {
    val request = requestId?.let { GalleryActivityRegistry.get(it)?.request }
    if (request == null) finish() else request.cancel()
  }

  override fun onDestroy() {
    if (isFinishing) {
      requestId?.let { id -> GalleryActivityRegistry.get(id)?.let { entry ->
        if (!entry.finishing) {
          entry.request.cancel()
          entry.request.settle(id, GalleryContractResult(canceled = true))
        }
      } }
    }
    // Normal Activity recreation must neither settle nor remove the request.
    super.onDestroy()
    requestId?.let { GalleryActivityRegistry.destroyed(it, this, isFinishing) }
  }

  private fun showImportProgress(request: GalleryRequest<GalleryContractResult>) {
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(32, 32, 32, 32); setBackgroundColor(Color.argb(225, 7, 5, 27))
      addView(ProgressBar(this@GalleryPickerActivity))
      addView(TextView(this@GalleryPickerActivity).apply {
        text = "Importing attachment…"; textSize = 18f; setTextColor(Color.WHITE); setPadding(0, 24, 0, 16)
      })
      addView(Button(this@GalleryPickerActivity).apply {
        text = "Cancel import"
        setOnClickListener { request.cancel(); text = "Canceling…"; isEnabled = false }
      })
    }
    setContentView(layout)
  }
}

internal object GalleryActivityRegistry {
  class Entry(val request: GalleryRequest<GalleryContractResult>) {
    @Volatile var activity: WeakReference<GalleryPickerActivity>? = null
    @Volatile var finishing = false
    val dismissed = CompletableFuture<Unit>()
  }
  private val entries = ConcurrentHashMap<String, Entry>()
  private val active = AtomicReference<Entry?>(null)
  fun register(request: GalleryRequest<GalleryContractResult>) {
    val entry = Entry(request)
    check(active.compareAndSet(null, entry)) { "GALLERY_BUSY" }
    if (entries.putIfAbsent(request.id, entry) != null) {
      active.compareAndSet(entry, null)
      error("GALLERY_BUSY")
    }
  }
  fun get(id: String): Entry? = entries[id]
  fun attach(id: String, activity: GalleryPickerActivity): Boolean {
    val entry = entries[id] ?: run { activity.finish(); return false }
    entry.activity = WeakReference(activity)
    if (entry.finishing) { activity.finish(); return false }
    return true
  }
  fun finish(request: GalleryRequest<GalleryContractResult>, launchFailed: Boolean): CompletableFuture<Unit> {
    val entry = entries[request.id]?.takeIf { it.request === request }
      ?: return CompletableFuture.completedFuture(Unit)
    entry.finishing = true
    if (launchFailed) complete(entry)
    else entry.activity?.get()?.let { activity -> activity.runOnUiThread { activity.finish() } }
    // If the proxy is being recreated, attach finishes the replacement. Do not
    // unlock merely because the old instance disappeared between callbacks.
    return entry.dismissed
  }
  fun destroyed(id: String, activity: GalleryPickerActivity, finishing: Boolean) {
    val entry = entries[id] ?: return
    if (entry.activity?.get() !== activity) return
    entry.activity = null
    if (finishing) complete(entry)
  }
  private fun complete(entry: Entry) {
    if (!entries.remove(entry.request.id, entry)) return
    active.compareAndSet(entry, null)
    entry.dismissed.complete(Unit)
  }
}
