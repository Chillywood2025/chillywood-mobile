package expo.modules.chillywoodcameraeffects;

import com.oney.WebRTCModule.videoEffects.VideoEffectProcessor;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import org.webrtc.JavaI420Buffer;
import org.webrtc.VideoFrame;

/** Actual production processor, compositor, pool and pinned WebRTC classes.
 * Only time and the asynchronous ML execution/completion boundary are controlled.
 * No sleeps, Android/WebRTC substitutes, model initialization or camera hardware.
 */
public final class CameraEffectFallbackTest {
  private static final long MS = 1_000_000L;
  private static int assertions;

  public static void main(String[] args) throws Exception {
    String selected = args.length == 0 ? "all" : args[0];
    check(args.length <= 1 && List.of("all", "no-work", "slow-conversion", "copy-fallback", "pool-pressure").contains(selected),
        "select a supported fallback test case");
    if (selected.equals("all") || selected.equals("no-work")) cooldownSkipsConversion();
    if (selected.equals("all") || selected.equals("slow-conversion")) slowFirstConversion();
    if (selected.equals("all") || selected.equals("copy-fallback")) slowCopyWithoutObservation();
    if (selected.equals("all") || selected.equals("pool-pressure")) poolPressureBudget();
    if (selected.equals("all")) {
      replacingGenerationWaitsWithoutConversion();
      inferenceIntervalSkipsConversion();
      freshObservationDuringBusyInference();
      missingAndThrowingConversions();
      closeDuringConversion();
      rejectedInferenceSubmission();
    }
    check(slot().availablePermits() == 1, "all paths restore the single global inference slot");
    System.out.println("Camera fallback contract (" + selected + "): " + assertions + " assertions passed");
  }

  private static void check(boolean condition, String message) {
    assertions++; if (!condition) throw new AssertionError(message);
  }

  private static Object field(Object target, String name) throws Exception {
    Field field = CameraEffectProcessor.class.getDeclaredField(name);
    field.setAccessible(true); return field.get(target);
  }

  private static void invoke(CameraEffectProcessor processor, String name) throws Exception {
    Method method = CameraEffectProcessor.class.getDeclaredMethod(name);
    method.setAccessible(true); method.invoke(processor);
  }

  private static Semaphore slot() throws Exception { return (Semaphore) field(null, "INFERENCE_SLOT"); }
  private static long pause(Fixture fixture) throws Exception { return (Long) field(fixture.processor, "pauseUntilNs"); }

  private static void publishFace(Fixture fixture, int rotation) throws Exception {
    Class<?> type = Class.forName(CameraEffectProcessor.class.getName() + "$Observation");
    Constructor<?> constructor = type.getDeclaredConstructors()[0];
    constructor.setAccessible(true);
    Object observation = constructor.newInstance(4, 4, rotation, fixture.clock.now,
        new EffectMath.FaceRegion(.1f, .1f, .8f, .8f), null, null);
    Method publish = CameraEffectProcessor.class.getDeclaredMethod("publish", type);
    publish.setAccessible(true); publish.invoke(fixture.processor, observation);
  }

  private static final class Clock implements LongSupplier {
    long now = 1_000 * MS;
    int reads, delayedRead;
    long readDelay;
    @Override public long getAsLong() {
      if (++reads == delayedRead) now += readDelay;
      return now;
    }
    void advance(long ns) { now += ns; }
  }

  // Holds submitted ML work without retaining a camera buffer. Closing first
  // then draining runs production infer()'s invalidated-generation completion.
  private static final class MlExecutor extends AbstractExecutorService {
    final ArrayDeque<Runnable> queued = new ArrayDeque<>();
    boolean shutdown;
    @Override public void execute(Runnable work) {
      if (shutdown) throw new RejectedExecutionException("Test ML executor is closed");
      queued.add(work);
    }
    @Override public void shutdown() { shutdown = true; }
    @Override public List<Runnable> shutdownNow() { shutdown(); return Collections.emptyList(); }
    @Override public boolean isShutdown() { return shutdown; }
    @Override public boolean isTerminated() { return shutdown && queued.isEmpty(); }
    @Override public boolean awaitTermination(long timeout, TimeUnit unit) { return isTerminated(); }
    void drain() { while (!queued.isEmpty()) queued.remove().run(); }
  }

  private static final class Fixture implements AutoCloseable {
    final Clock clock = new Clock();
    final MlExecutor executor = new MlExecutor();
    final CameraEffectProcessor processor = new CameraEffectProcessor("studio-light", 1f, clock, executor);
    @Override public void close() { processor.close(); executor.drain(); }
  }

  // A capture-side texture test double implementing the actual SDK Buffer API.
  // Converted planes/refcounts are provided by the real JavaI420Buffer, so the
  // production processor and SDK wrapper execute real retain/release behavior.
  private static final class Texture implements VideoFrame.Buffer {
    final Clock clock;
    final JavaI420Buffer data;
    int conversions, releases;
    long conversionNs, planeReadNs;
    boolean returnNull, throwConversion;
    Runnable duringConversion;
    Texture(Clock clock) {
      this.clock = clock;
      data = JavaI420Buffer.wrap(4, 4, ByteBuffer.allocateDirect(16), 4,
          ByteBuffer.allocateDirect(4), 2, ByteBuffer.allocateDirect(4), 2, () -> releases++);
    }
    @Override public int getWidth() { return 4; }
    @Override public int getHeight() { return 4; }
    @Override public void retain() { data.retain(); }
    @Override public void release() { data.release(); }
    @Override public VideoFrame.Buffer cropAndScale(int x, int y, int w, int h, int sw, int sh) {
      throw new AssertionError("Unexpected texture scaling");
    }
    @Override public VideoFrame.I420Buffer toI420() {
      conversions++; clock.advance(conversionNs);
      if (duringConversion != null) duringConversion.run();
      if (throwConversion) throw new IllegalStateException("Test conversion failure");
      if (returnNull) return null;
      data.retain();
      return new VideoFrame.I420Buffer() {
        @Override public int getWidth() { return data.getWidth(); }
        @Override public int getHeight() { return data.getHeight(); }
        @Override public ByteBuffer getDataY() { clock.advance(planeReadNs); return data.getDataY(); }
        @Override public int getStrideY() { return data.getStrideY(); }
        @Override public ByteBuffer getDataU() { return data.getDataU(); }
        @Override public int getStrideU() { return data.getStrideU(); }
        @Override public ByteBuffer getDataV() { return data.getDataV(); }
        @Override public int getStrideV() { return data.getStrideV(); }
        @Override public void retain() { data.retain(); }
        @Override public void release() { data.release(); }
        @Override public VideoFrame.I420Buffer toI420() { retain(); return this; }
        @Override public VideoFrame.Buffer cropAndScale(int x, int y, int w, int h, int sw, int sh) {
          throw new AssertionError("Unexpected I420 scaling");
        }
      };
    }
    void releaseCaptureReference() {
      check(releases == 0, "fallback preserves capturer-owned input reference");
      release();
      check(releases == 1, "converted input is balanced and is not retained for ML");
    }
  }

  private static void passthrough(Fixture fixture, Texture texture) {
    VideoFrame frame = new VideoFrame(texture, 90, 123456789L);
    VideoEffectProcessor pipeline = new VideoEffectProcessor(Collections.singletonList(fixture.processor), null);
    int[] deliveries = {0};
    pipeline.setSink(result -> {
      check(result == frame, "fallback delivers the exact original frame through the actual SDK wrapper");
      deliveries[0]++;
    });
    pipeline.onFrameCaptured(frame);
    check(deliveries[0] == 1, "fallback delivers exactly once");
  }

  private static void cooldownSkipsConversion() throws Exception {
    try (Fixture fixture = new Fixture()) {
      invoke(fixture.processor, "failInference");
      Texture texture = new Texture(fixture.clock);
      texture.conversionNs = 65 * MS;
      for (int i = 0; i < 3; i++) { passthrough(fixture, texture); fixture.clock.advance(20 * MS); }
      check(texture.conversions == 0, "cooldown without fresh analysis must skip texture conversion");
      check(fixture.executor.queued.isEmpty(), "cooldown does not submit inference");
      check(fixture.processor.status().get("state").equals("unavailable"), "cooldown retains model-unavailable status");
      texture.releaseCaptureReference();
    }
  }

  private static void slowFirstConversion() throws Exception {
    try (Fixture fixture = new Fixture()) {
      Texture texture = new Texture(fixture.clock); texture.conversionNs = 65 * MS;
      passthrough(fixture, texture);
      check(pause(fixture) == fixture.clock.now + 500 * MS, "slow first conversion must enter the performance pause");
      check(slot().availablePermits() == 1, "slow conversion releases its unsubmitted inference reservation");
      check(fixture.executor.queued.isEmpty(), "over-budget conversion does not start more work");
      passthrough(fixture, texture);
      check(texture.conversions == 1, "performance pause avoids repeated slow readbacks");
      fixture.clock.advance(501 * MS);
      texture.conversionNs = 0;
      passthrough(fixture, texture);
      check(texture.conversions == 2 && fixture.executor.queued.size() == 1, "inference can resume after the performance pause");
      texture.releaseCaptureReference();
    }
  }

  private static void slowCopyWithoutObservation() throws Exception {
    try (Fixture fixture = new Fixture()) {
      Texture texture = new Texture(fixture.clock); texture.planeReadNs = 65 * MS;
      passthrough(fixture, texture);
      check(fixture.executor.queued.size() == 1, "private NV21 copy is submitted at the real ML boundary");
      check(pause(fixture) == fixture.clock.now + 500 * MS, "slow NV21 fallback must enter the performance pause");
      passthrough(fixture, texture);
      check(texture.conversions == 1, "slow copy pause prevents another conversion");
      texture.releaseCaptureReference();
    }
  }

  private static void replacingGenerationWaitsWithoutConversion() throws Exception {
    try (Fixture old = new Fixture(); Fixture replacement = new Fixture()) {
      Texture first = new Texture(old.clock);
      passthrough(old, first);
      check(old.executor.queued.size() == 1, "first generation reserves one inference job");
      first.releaseCaptureReference();
      old.processor.close();
      Texture next = new Texture(replacement.clock);
      passthrough(replacement, next); passthrough(replacement, next);
      check(next.conversions == 0, "another generation's busy inference must not cause readback");
      old.executor.drain();
      check(old.processor.status().get("state").equals("off"), "late completion cannot reactivate old generation");
      passthrough(replacement, next);
      check(next.conversions == 1 && replacement.executor.queued.size() == 1, "replacement starts after old work finishes");
      next.releaseCaptureReference();
    }
  }

  private static void inferenceIntervalSkipsConversion() throws Exception {
    try (Fixture fixture = new Fixture()) {
      Texture texture = new Texture(fixture.clock);
      passthrough(fixture, texture);
      fixture.executor.queued.clear(); invoke(fixture.processor, "finishInference");
      fixture.clock.advance(20 * MS);
      passthrough(fixture, texture);
      check(texture.conversions == 1, "normal inference throttle skips readback without a usable observation");
      fixture.clock.advance(61 * MS);
      passthrough(fixture, texture);
      check(texture.conversions == 2, "normal inference throttle admits work after its interval");
      texture.releaseCaptureReference();
    }
  }

  private static void freshObservationDuringBusyInference() throws Exception {
    try (Fixture fixture = new Fixture()) {
      check(slot().tryAcquire(), "test holds another inference's slot");
      try {
        publishFace(fixture, 90);
        Texture texture = new Texture(fixture.clock);
        VideoFrame frame = new VideoFrame(texture, 90, 123456789L);
        VideoFrame output = fixture.processor.process(frame, null);
        check(output != null, "fresh observation still composites while inference is busy");
        check(output.getRotation() == 90 && output.getTimestampNs() == frame.getTimestampNs(), "output retains orientation and timestamp");
        output.release();
        check(fixture.processor.status().get("state").equals("active"), "only a processed output reports active");
        check(fixture.processor.process(new VideoFrame(texture, 0, 2), null) == null, "old orientation cannot be composed");
        check(texture.conversions == 1, "orientation mismatch without admitted inference skips readback");
        fixture.clock.advance(251 * MS);
        passthrough(fixture, texture);
        check(texture.conversions == 1, "expired observation without admitted inference skips readback");
        check(fixture.processor.status().get("state").equals("starting"), "expired output returns to waiting status");
        texture.releaseCaptureReference();
      } finally { slot().release(); }
    }
  }

  private static void missingAndThrowingConversions() throws Exception {
    for (boolean throwsFailure : new boolean[]{false, true}) {
      try (Fixture fixture = new Fixture()) {
        Texture texture = new Texture(fixture.clock);
        texture.conversionNs = 65 * MS; texture.throwConversion = throwsFailure; texture.returnNull = !throwsFailure;
        passthrough(fixture, texture);
        check(slot().availablePermits() == 1, "missing/throwing conversion releases inference reservation");
        long expectedDelay = (throwsFailure ? 1_000 : 500) * MS;
        check(pause(fixture) == fixture.clock.now + expectedDelay, "fallback is budgeted without shortening the error pause");
        if (throwsFailure) check(fixture.processor.status().get("state").equals("error"), "performance accounting preserves the error reason");
        texture.releaseCaptureReference();
      }
    }
  }

  private static void closeDuringConversion() throws Exception {
    try (Fixture fixture = new Fixture()) {
      Texture texture = new Texture(fixture.clock);
      texture.duringConversion = fixture.processor::close;
      passthrough(fixture, texture);
      check(slot().availablePermits() == 1 && fixture.executor.queued.isEmpty(), "close during conversion releases unsubmitted work");
      check(fixture.executor.isShutdown(), "closing an admitted generation eventually disposes resources");
      check(fixture.processor.status().get("state").equals("off"), "close remains terminal");
      texture.releaseCaptureReference();
    }
  }

  private static void rejectedInferenceSubmission() throws Exception {
    try (Fixture fixture = new Fixture()) {
      fixture.executor.shutdown();
      Texture texture = new Texture(fixture.clock);
      passthrough(fixture, texture);
      check(slot().availablePermits() == 1, "executor rejection releases inference reservation");
      check(fixture.processor.status().get("state").equals("unavailable"), "rejection reports model fallback");
      passthrough(fixture, texture);
      check(texture.conversions == 1, "rejected submission cooldown skips further conversion");
      texture.releaseCaptureReference();
    }
  }

  private static void poolPressureBudget() throws Exception {
    try (Fixture fixture = new Fixture()) {
      check(slot().tryAcquire(), "test holds inference while supplying a fresh cached observation");
      FrameBufferPool pool = (FrameBufferPool) field(fixture.processor, "buffers");
      JavaI420Buffer[] held = {pool.acquire(4, 4), pool.acquire(4, 4), pool.acquire(4, 4)};
      try {
        publishFace(fixture, 90);
        Texture texture = new Texture(fixture.clock);
        // The next elapsed-time sample after conversion represents time spent
        // waiting on the pool monitor. No output slot is available on return.
        fixture.clock.reads = 0; fixture.clock.delayedRead = 3; fixture.clock.readDelay = 65 * MS;
        passthrough(fixture, texture);
        check(pause(fixture) == fixture.clock.now + 500 * MS, "pool-pressure fallback must enforce elapsed capture budget");
        check(((Number) fixture.processor.status().get("processedFrames")).longValue() == 0, "pool pressure cannot report processed output");
        texture.releaseCaptureReference();
      } finally { for (JavaI420Buffer buffer : held) buffer.release(); slot().release(); }
    }
  }
}
