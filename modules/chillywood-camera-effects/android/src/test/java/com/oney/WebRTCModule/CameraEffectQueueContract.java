package com.oney.WebRTCModule;

import com.oney.WebRTCModule.videoEffects.ProcessorProvider;
import com.oney.WebRTCModule.videoEffects.VideoEffectProcessor;
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.webrtc.JavaI420Buffer;
import org.webrtc.VideoFrame;

/** Actual pinned SDK executor/provider/wrapper; no Android app or ML inference. */
public final class CameraEffectQueueContract {
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }

  public static void verify() {
    ExecutorService bridge = Executors.newSingleThreadExecutor();
    CountDownLatch bridgeEntered = new CountDownLatch(1), allowAttach = new CountDownLatch(1);
    try {
      String name = "queue-contract-old-generation";
      ChillywoodProcessorRegistry.register(name, (frame, helper) -> null);
      ThreadUtils.submitToExecutor(() -> {
        check(ProcessorProvider.getProcessor(name) != null, "initial registration precedes lookup");
      }).get(5, TimeUnit.SECONDS);
      // RN VoidKind invokes asynchronously. Hold that queue while the Expo
      // synchronous release reaches the real WebRTC executor first.
      java.util.concurrent.Future<?> delayedAttach = bridge.submit(() -> {
        bridgeEntered.countDown();
        try {
          check(allowAttach.await(5, TimeUnit.SECONDS), "delayed bridge released");
          ThreadUtils.submitToExecutor(() -> {
            VideoFrameProcessor found = ProcessorProvider.getProcessor(name);
            check(found == null, "late old-name lookup follows provider removal");
            // This is the empty filtered list GetUserMediaImpl installs when
            // an asynchronous name lookup no longer resolves a provider.
            List<VideoFrameProcessor> resolved = found == null ? Collections.emptyList() : Collections.singletonList(found);
            assertBorrowedFrame(new VideoEffectProcessor(resolved, null));
          }).get(5, TimeUnit.SECONDS);
        } catch (Exception error) {
          throw new AssertionError("delayed attach ownership failed", error);
        }
      });
      check(bridgeEntered.await(5, TimeUnit.SECONDS), "RN bridge task reached its barrier");
      ChillywoodProcessorRegistry.remove(name);
      ThreadUtils.submitToExecutor(() -> {
        check(ProcessorProvider.getProcessor(name) == null, "cleanup reached SDK before delayed attach");
      }).get(5, TimeUnit.SECONDS);
      allowAttach.countDown();
      delayedAttach.get(5, TimeUnit.SECONDS);

      // Opposite order: lookup retains the already closed/pass-through object.
      ChillywoodProcessorRegistry.register(name, (frame, helper) -> null);
      VideoFrameProcessor borrowed = ThreadUtils.submitToExecutor(() -> ProcessorProvider.getProcessor(name)).get(5, TimeUnit.SECONDS);
      ChillywoodProcessorRegistry.remove(name);
      ThreadUtils.submitToExecutor(() -> {
        check(ProcessorProvider.getProcessor(name) == null, "opposite-order cleanup removes provider");
        assertBorrowedFrame(new VideoEffectProcessor(Collections.singletonList(borrowed), null));
      }).get(5, TimeUnit.SECONDS);
      System.out.println("Real SDK queue ownership: delayed-attach and lookup-before-remove passed");
    } catch (Exception error) {
      throw new AssertionError("SDK executor queue regression failed", error);
    } finally {
      allowAttach.countDown();
      bridge.shutdownNow();
      // The SDK's static executor is non-daemon. Test-only shutdown prevents a
      // completed JVM harness from hanging; production never reflects on it.
      try {
        Field field = ThreadUtils.class.getDeclaredField("executor");
        field.setAccessible(true);
        ((ExecutorService) field.get(null)).shutdownNow();
      } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
  }

  private static void assertBorrowedFrame(VideoEffectProcessor pipeline) {
    AtomicInteger freed = new AtomicInteger(), delivered = new AtomicInteger();
    VideoFrame input = new VideoFrame(JavaI420Buffer.wrap(4, 4, ByteBuffer.allocateDirect(16), 4,
        ByteBuffer.allocateDirect(4), 2, ByteBuffer.allocateDirect(4), 2, freed::incrementAndGet), 90, 123L);
    pipeline.setSink(frame -> {
      check(frame == input, "natural video delivers exact original frame");
      delivered.incrementAndGet();
    });
    pipeline.onFrameCaptured(input);
    check(delivered.get() == 1, "one outgoing frame delivered");
    check(freed.get() == 0, "queued empty chain must preserve capturer ownership");
    input.release();
    check(freed.get() == 1, "capturer releases original once");
  }
}
