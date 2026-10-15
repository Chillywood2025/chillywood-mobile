package expo.modules.chillywoodcameraeffects;

import com.oney.WebRTCModule.videoEffects.VideoEffectProcessor;
import com.oney.WebRTCModule.CameraEffectQueueContract;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;
import org.webrtc.JavaI420Buffer;
import org.webrtc.VideoFrame;

/** Uses the real pinned WebRTC AAR. Does not start ML Kit or an Android app. */
public final class CaptureContractTest {
  private static int assertions;
  public static void main(String[] args) {
    if (args.length == 1 && args[0].equals("--queue-only")) {
      CameraEffectQueueContract.verify();
      return;
    }
    passthroughOwnership(); transformedOwnership(); poolOwnership(); closedGeneration(); emptyChainOwnership();
    CameraEffectQueueContract.verify();
    System.out.println("Camera capture contract: " + assertions + " assertions passed");
  }
  private static void check(boolean condition, String message) {
    assertions++; if (!condition) throw new AssertionError(message);
  }
  private static JavaI420Buffer buffer(AtomicInteger releases) {
    return JavaI420Buffer.wrap(4, 4, ByteBuffer.allocateDirect(16), 4,
        ByteBuffer.allocateDirect(4), 2, ByteBuffer.allocateDirect(4), 2, releases::incrementAndGet);
  }
  private static void passthroughOwnership() {
    AtomicInteger releases = new AtomicInteger(), delivered = new AtomicInteger();
    VideoFrame input = new VideoFrame(buffer(releases), 90, 123456789L);
    VideoEffectProcessor pipeline = new VideoEffectProcessor(Collections.singletonList((f, t) -> null), null);
    pipeline.setSink(f -> { check(f == input, "null effect passes exact original frame"); delivered.incrementAndGet(); });
    pipeline.onFrameCaptured(input);
    check(delivered.get() == 1, "passthrough delivered once");
    check(releases.get() == 0, "wrapper does not consume capturer-owned reference");
    input.release();
    check(releases.get() == 1, "input freed exactly once after capturer release");
  }
  private static void transformedOwnership() {
    AtomicInteger inputReleases = new AtomicInteger(), outputReleases = new AtomicInteger();
    VideoFrame input = new VideoFrame(buffer(inputReleases), 270, 987654321L);
    VideoEffectProcessor pipeline = new VideoEffectProcessor(Collections.singletonList((f, t) ->
        new VideoFrame(buffer(outputReleases), f.getRotation(), f.getTimestampNs())), null);
    pipeline.setSink(f -> {
      check(f != input, "transformed frame delivered to WebRTC sink");
      check(f.getRotation() == 270, "output rotation preserved");
      check(f.getTimestampNs() == 987654321L, "output timestamp preserved");
    });
    pipeline.onFrameCaptured(input);
    check(outputReleases.get() == 1, "wrapper releases output exactly once");
    check(inputReleases.get() == 0, "capturer still owns input");
    input.release(); check(inputReleases.get() == 1, "input refcount balanced");
  }
  private static void poolOwnership() {
    FrameBufferPool pool = new FrameBufferPool();
    JavaI420Buffer first = pool.acquire(4,4), second = pool.acquire(4,4), third = pool.acquire(4,4);
    check(first != null && second != null && third != null, "three output slots available");
    first.getDataY().put(0, (byte) 77);
    first.retain(); first.release();
    check(pool.acquire(4,4) == null, "retained encoder frame cannot be overwritten");
    check(pool.acquire(8,8) == null, "size change cannot bypass retained-buffer bound");
    first.release();
    JavaI420Buffer recycled = pool.acquire(4,4);
    check(recycled != null && recycled.getDataY().get(0) == 77, "slot reused only after final release");
    pool.close();
    check(pool.acquire(4,4) == null, "closed pool does not allocate");
    recycled.release(); second.release(); third.release();
    check(pool.acquire(4,4) == null, "late encoder releases do not reopen pool");
  }
  private static void closedGeneration() {
    CameraEffectProcessor processor = new CameraEffectProcessor("studio-light", 1f);
    processor.close(); processor.close();
    AtomicInteger releases = new AtomicInteger();
    VideoFrame frame = new VideoFrame(buffer(releases), 0, 42L);
    check(processor.process(frame, null) == null, "closed generation immediately passes original frames");
    check(processor.status().get("state").equals("off"), "closed status is off");
    check(((Number) processor.status().get("processedFrames")).longValue() == 0, "closed generation cannot claim processed output");
    check(releases.get() == 0, "closed generation does not retain or release input");
    frame.release();
  }
  private static void emptyChainOwnership() {
    AtomicInteger releases = new AtomicInteger();
    VideoFrame input = new VideoFrame(buffer(releases), 0, 7L);
    VideoEffectProcessor empty = new VideoEffectProcessor(Collections.emptyList(), null);
    empty.setSink(f -> check(f == input, "empty upstream chain returns original input"));
    empty.onFrameCaptured(input);
    check(releases.get() == 0, "empty chain must preserve the capturer-owned reference");
    input.release();
    check(releases.get() == 1, "empty-chain input freed only by its capturer");
    AtomicInteger sinklessReleases = new AtomicInteger();
    VideoFrame sinklessInput = new VideoFrame(buffer(sinklessReleases), 0, 8L);
    VideoEffectProcessor sinkless = new VideoEffectProcessor(Collections.emptyList(), null);
    sinkless.onFrameCaptured(sinklessInput);
    check(sinklessReleases.get() == 0, "empty chain without sink does not consume input");
    sinklessInput.release();
  }
}
