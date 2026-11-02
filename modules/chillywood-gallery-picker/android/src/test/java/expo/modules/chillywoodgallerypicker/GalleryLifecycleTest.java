package expo.modules.chillywoodgallerypicker;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

/** Executes production cancellation/request code without Android SDK stand-ins. */
public final class GalleryLifecycleTest {
  private static int assertions;
  private static void check(boolean value) { assertions++; if (!value) throw new AssertionError("Gallery lifecycle assertion " + assertions); }
  private static final class BlockedStream extends InputStream {
    final CountDownLatch reading = new CountDownLatch(1), closed = new CountDownLatch(1);
    @Override public int read() throws IOException { throw new IOException("use buffer"); }
    @Override public int read(byte[] bytes) throws IOException {
      reading.countDown();
      try { if (!closed.await(3, TimeUnit.SECONDS)) throw new IOException("test reader never closed"); }
      catch (InterruptedException e) { throw new IOException(e); }
      // A provider may return a last byte after cancellation. It must not write.
      bytes[0] = 42; return 1;
    }
    @Override public void close() { closed.countDown(); }
  }
  public static void main(String[] args) throws Exception {
    GalleryRequest<String> request = new GalleryRequest<>("old", 7);
    request.cancel(); check(request.canceled.get()); check(!request.result.isDone());
    check(!request.settle("new", "wrong")); check(!request.result.isDone());
    check(request.settle("old", "canceled")); check(!request.settle("old", "late"));
    check("canceled".equals(request.result.get()));
    for (boolean timeout : new boolean[] { false, true }) {
      CountDownLatch providerEntered = new CountDownLatch(1), releaseProvider = new CountDownLatch(1), providerDone = new CountDownLatch(1);
      BlockedStream stream = new BlockedStream(); ByteArrayOutputStream output = new ByteArrayOutputStream();
      AtomicReference<Throwable> error = new AtomicReference<>(); CountDownLatch writerDone = new CountDownLatch(1);
      GalleryImportControl control = new GalleryImportControl(() -> {
        providerEntered.countDown();
        try { releaseProvider.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        finally { providerDone.countDown(); }
      }, timeout ? 100 : 10_000);
      control.attach(stream);
      Thread writer = new Thread(() -> {
        try { GalleryImportPolicy.copy(stream, output, 100, control::isCurrent); }
        catch (Throwable e) { error.set(e); }
        finally { control.detach(stream); writerDone.countDown(); }
      });
      writer.start(); check(stream.reading.await(2, TimeUnit.SECONDS));
      if (!timeout) control.requestCancel("GALLERY_RETIRED");
      try {
        check(providerEntered.await(2, TimeUnit.SECONDS));
        // The synchronous provider cancel remains blocked. Stream close and
        // writer exit must still happen, independently of that callback.
        check(stream.closed.await(2, TimeUnit.SECONDS)); check(writerDone.await(2, TimeUnit.SECONDS));
        check(releaseProvider.getCount() == 1); check(output.size() == 0);
        check(error.get() instanceof IOException); check(!control.isCurrent());
        check((timeout ? "GALLERY_IMPORT_TIMEOUT" : "GALLERY_RETIRED").equals(control.reason()));
        control.requestCancel("later"); check(!"later".equals(control.reason()));
      } finally { releaseProvider.countDown(); control.close(); writer.join(2_000); providerDone.await(2, TimeUnit.SECONDS); }
    }
    CountDownLatch stuck = new CountDownLatch(2), releaseStuck = new CountDownLatch(1);
    AtomicInteger executing = new AtomicInteger();
    GalleryImportControl[] controls = new GalleryImportControl[5];
    try {
      for (int i = 0; i < controls.length; i++) {
        controls[i] = new GalleryImportControl(() -> {
          executing.incrementAndGet(); stuck.countDown();
          try { releaseStuck.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, 10_000);
        BlockedStream stream = new BlockedStream(); controls[i].attach(stream);
        controls[i].requestCancel("GALLERY_RETIRED");
        check(stream.closed.await(2, TimeUnit.SECONDS));
        if (i == 1) check(stuck.await(2, TimeUnit.SECONDS));
        if (i > 1) check(controls[i].providerCancellationUnavailable());
      }
      check(executing.get() == 2); // Bounded workers, no retry-created thread leak.
    } finally {
      releaseStuck.countDown(); for (GalleryImportControl control : controls) if (control != null) control.close();
    }
    System.out.println("Gallery production lifecycle: " + assertions + " JVM assertions passed");
  }
}
