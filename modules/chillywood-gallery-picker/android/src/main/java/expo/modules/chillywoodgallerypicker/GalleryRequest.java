package expo.modules.chillywoodgallerypicker;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Request identity survives Activity recreation while Expo AppContext lives. */
public final class GalleryRequest<T> {
  public final String id;
  public final long generation;
  public final CompletableFuture<T> result = new CompletableFuture<>();
  public final AtomicBoolean canceled = new AtomicBoolean(false);
  public final AtomicReference<GalleryImportControl> importer = new AtomicReference<>();
  public GalleryRequest(String id, long generation) { this.id = id; this.generation = generation; }
  public boolean settle(String returnedId, T value) { return id.equals(returnedId) && result.complete(value); }
  public void cancel() {
    canceled.set(true);
    GalleryImportControl current = importer.get();
    if (current != null) current.requestCancel("GALLERY_RETIRED");
    // Cancellation is NOT settlement: the chooser/writer still owns its lease.
  }
}
