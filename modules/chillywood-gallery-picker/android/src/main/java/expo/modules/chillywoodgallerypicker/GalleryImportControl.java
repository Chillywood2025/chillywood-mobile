package expo.modules.chillywoodgallerypicker;

import java.io.Closeable;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;

/** Cancellation signals/stream closure never imply the importing worker exited. */
public final class GalleryImportControl implements AutoCloseable {
  private static final ScheduledThreadPoolExecutor DEADLINES = deadlines();
  private static ScheduledThreadPoolExecutor deadlines() {
    ScheduledThreadPoolExecutor executor = new ScheduledThreadPoolExecutor(1, runnable -> {
      Thread thread = new Thread(runnable, "gallery-import-cancellation"); thread.setDaemon(true); return thread;
    });
    executor.setRemoveOnCancelPolicy(true);
    return executor;
  }
  // A provider may synchronously block CancellationSignal.cancel(). It must not
  // block stream closure, another deadline, or the UI. A stuck provider cancel
  // can outlive its reader, so both pools are bounded, with no unbounded queue.
  private static final ExecutorService PROVIDER_CANCELLATIONS = daemonExecutor("gallery-provider-cancel");
  private static final ExecutorService STREAM_CLOSURES = daemonExecutor("gallery-stream-close");
  private static ExecutorService daemonExecutor(String name) {
    return new ThreadPoolExecutor(0, 2, 30, TimeUnit.SECONDS, new SynchronousQueue<>(), runnable -> {
      Thread thread = new Thread(runnable, name); thread.setDaemon(true); return thread;
    }, new ThreadPoolExecutor.AbortPolicy());
  }
  private final AtomicReference<String> reason = new AtomicReference<>();
  private final AtomicReference<Closeable> resource = new AtomicReference<>();
  private final Runnable cancelProvider;
  private final ScheduledFuture<?> deadline;
  private final AtomicBoolean providerCancellationUnavailable = new AtomicBoolean();
  private final AtomicBoolean streamClosureUnavailable = new AtomicBoolean();

  public GalleryImportControl(Runnable cancelProvider, long deadlineMilliseconds) {
    this.cancelProvider = cancelProvider;
    this.deadline = DEADLINES.schedule(() -> requestCancel("GALLERY_IMPORT_TIMEOUT"), deadlineMilliseconds, TimeUnit.MILLISECONDS);
  }
  public String reason() { return reason.get(); }
  public boolean isCurrent() { return reason.get() == null; }
  public boolean providerCancellationUnavailable() { return providerCancellationUnavailable.get(); }
  public boolean streamClosureUnavailable() { return streamClosureUnavailable.get(); }
  public void attach(Closeable stream) throws IOException {
    resource.set(stream);
    if (!isCurrent()) { stream.close(); throw new IOException(reason.get()); }
  }
  public void detach(Closeable stream) { resource.compareAndSet(stream, null); }
  public void requestCancel(String value) {
    if (!reason.compareAndSet(null, value)) return;
    // Never run provider cancellation or stream close on the UI thread. The
    // caller continues awaiting the real importer; no timer resolves its result.
    try { PROVIDER_CANCELLATIONS.execute(() -> {
      try { cancelProvider.run(); } catch (RuntimeException ignored) { }
    }); } catch (RejectedExecutionException unavailable) {
      providerCancellationUnavailable.set(true);
      // Do not block or queue indefinitely behind broken providers. Closure
      // still gets an independent chance; only the actual reader can settle.
    }
    try { STREAM_CLOSURES.execute(() -> {
      Closeable stream = resource.get();
      if (stream != null) try { stream.close(); } catch (IOException | RuntimeException ignored) { }
    }); } catch (RejectedExecutionException unavailable) {
      streamClosureUnavailable.set(true);
      // Never resolve the native request just because cancellation was rejected.
    }
  }
  @Override public void close() { deadline.cancel(false); resource.set(null); }
}
