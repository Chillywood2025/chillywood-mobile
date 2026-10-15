package expo.modules.chillywoodcameraeffects;

import android.graphics.Rect;
import android.os.SystemClock;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import com.google.mlkit.vision.segmentation.Segmentation;
import com.google.mlkit.vision.segmentation.SegmentationMask;
import com.google.mlkit.vision.segmentation.Segmenter;
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions;
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor;
import java.nio.ByteBuffer;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;
import org.webrtc.JavaI420Buffer;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoFrame;

/**
 * Transforms capture buffers before WebRTC's VideoSource reaches its encoder.
 * ML inference runs on-device and never holds a camera buffer asynchronously.
 * Each configure creates an isolated generation; close invalidates it forever.
 */
public final class CameraEffectProcessor implements VideoFrameProcessor, AutoCloseable {
  private static final long MAX_AGE_NS = 250_000_000L;
  private static final long INFERENCE_INTERVAL_NS = 80_000_000L;
  private static final long COMPOSITE_BUDGET_NS = 45_000_000L;
  private static final Executor DIRECT = Runnable::run;
  // Also bounds overlap between an invalidated generation and its replacement.
  private static final Semaphore INFERENCE_SLOT = new Semaphore(1);
  private final String effect;
  private final float intensity;
  private final Object stateLock = new Object();
  private final FrameBufferPool buffers = new FrameBufferPool();
  private final AtomicBoolean inferenceInFlight = new AtomicBoolean(false);
  private final LongSupplier nanoTime;
  private final ExecutorService inferenceExecutor;
  private volatile boolean closed;
  private volatile Observation observation;
  private volatile long nextInferenceNs;
  private volatile long pauseUntilNs;
  private volatile long lastOutputNs;
  private long processedFrames;
  private String state = "starting";
  private String reason = "Waiting for a camera frame";
  private FaceDetector faceDetector;
  private Segmenter segmenter;
  // Inference callbacks are serialized by INFERENCE_SLOT. Kept within this
  // generation; no centroid history is shared between tracks or configurations.
  private float skylineCenterX = .5f, skylineCenterY = .5f;

  private static final class Observation {
    final int width, height, rotation;
    final long capturedNs;
    final EffectMath.FaceRegion face;
    final EffectMath.Mask mask;
    final EffectMath.Skyline skyline;
    Observation(int width, int height, int rotation, long capturedNs,
        EffectMath.FaceRegion face, EffectMath.Mask mask, EffectMath.Skyline skyline) {
      this.width = width; this.height = height; this.rotation = rotation;
      this.capturedNs = capturedNs; this.face = face; this.mask = mask; this.skyline = skyline;
    }
    boolean matches(int w, int h, int r, long now) {
      return width == w && height == h && rotation == r && now >= capturedNs && now - capturedNs <= MAX_AGE_NS;
    }
  }

  public CameraEffectProcessor(String effect, float intensity) {
    this(effect, intensity, SystemClock::elapsedRealtimeNanos, Executors.newSingleThreadExecutor(r -> {
      Thread t = new Thread(r, "ChillywoodCameraInference"); t.setDaemon(true); return t;
    }));
  }

  // Deterministic host tests control time and the asynchronous ML work boundary.
  CameraEffectProcessor(String effect, float intensity, LongSupplier nanoTime, ExecutorService inferenceExecutor) {
    this.effect = effect; this.intensity = intensity;
    this.nanoTime = nanoTime; this.inferenceExecutor = inferenceExecutor;
  }

  public Map<String, Object> status() {
    synchronized (stateLock) {
      Map<String, Object> result = new HashMap<>();
      boolean expired = state.equals("active") && nanoTime.getAsLong() - lastOutputNs > MAX_AGE_NS;
      result.put("state", expired ? "starting" : state);
      result.put("processedFrames", processedFrames);
      if (expired) result.put("reason", "Waiting for a fresh processed camera frame");
      else if (reason != null) result.put("reason", reason);
      return result;
    }
  }

  @Override public VideoFrame process(VideoFrame frame, SurfaceTextureHelper ignored) {
    if (closed) return null;
    long now = nanoTime.getAsLong();
    int width = frame.getBuffer().getWidth(), height = frame.getBuffer().getHeight();
    int rotation = frame.getRotation();
    if (!EffectMath.validDimensions(width, height, rotation)) {
      update("unavailable", "Camera effects require an even-sized camera stream at 720p or lower");
      return null;
    }
    if (now < pauseUntilNs) return null;
    VideoFrame.I420Buffer input = null;
    JavaI420Buffer output = null;
    boolean inferenceReserved = false;
    try {
      Observation current = observation;
      inferenceReserved = reserveInference(now);
      if (!inferenceReserved && (current == null || !current.matches(width, height, rotation, now))) {
        awaitingObservation();
        return null;
      }
      // Texture readback is expensive. Do it only for usable analysis or work
      // that already owns the single inference slot, including across generations.
      input = frame.getBuffer().toI420();
      if (input == null) {
        update("unavailable", "The camera did not provide a convertible video frame");
        return null;
      }
      if (nanoTime.getAsLong() - now > COMPOSITE_BUDGET_NS) return null;
      if (inferenceReserved) {
        inferenceReserved = false; // submitInference now owns completion/release.
        submitInference(input, rotation, now);
      }
      current = observation;
      if (current == null || !current.matches(width, height, rotation, now)) {
        // Never use an old orientation or an old subject mask after a camera switch.
        awaitingObservation();
        return null;
      }
      output = buffers.acquire(width, height);
      if (output == null) {
        update("starting", "Waiting for the video encoder to release a frame");
        return null;
      }
      EffectMath.composite(width, height, rotation, intensity,
          input.getDataY(), input.getStrideY(), input.getDataU(), input.getStrideU(), input.getDataV(), input.getStrideV(),
          output.getDataY(), output.getStrideY(), output.getDataU(), output.getStrideU(), output.getDataV(), output.getStrideV(),
          current.face, current.mask, current.skyline, effect, frame.getTimestampNs());
      long completed = nanoTime.getAsLong();
      if (completed - now > COMPOSITE_BUDGET_NS) return null;
      synchronized (stateLock) {
        if (closed || !current.matches(width, height, rotation, completed)) return null;
        VideoFrame result = new VideoFrame(output, rotation, frame.getTimestampNs());
        output = null; // The returned VideoFrame owns this sole reference.
        processedFrames++; lastOutputNs = completed; state = "active"; reason = null;
        return result;
      }
    } catch (RuntimeException | LinkageError | OutOfMemoryError failure) {
      pauseUntilNs = nanoTime.getAsLong() + 1_000_000_000L;
      update("error", "Camera processing failed; original video is continuing");
      return null;
    } finally {
      if (inferenceReserved) finishInference();
      if (output != null) output.release();
      if (input != null) input.release();
      // Conversion, NV21 copying and pool-pressure/failure exits consume the
      // capture thread too. They must not bypass the same budget as composition.
      long completed = nanoTime.getAsLong();
      if (completed - now > COMPOSITE_BUDGET_NS) {
        synchronized (stateLock) {
          if (!closed) {
            pauseUntilNs = Math.max(pauseUntilNs, completed + 500_000_000L);
            if (!state.equals("error")) {
              state = "unavailable"; reason = "Camera effect paused to preserve call performance";
            }
          }
        }
      }
    }
    // In pinned WebRTC 144, null is the safe original-frame path: its wrapper
    // retains input and releases it once. Returning input without retain would
    // cause a double release. We never retain input across asynchronous work.
  }

  private void awaitingObservation() {
    synchronized (stateLock) {
      if (!closed && state.equals("active")) {
        state = "starting"; reason = "Waiting for fresh subject detection";
      }
    }
  }

  private boolean reserveInference(long capturedNs) {
    if (closed || capturedNs < nextInferenceNs || !INFERENCE_SLOT.tryAcquire()) return false;
    if (!inferenceInFlight.compareAndSet(false, true)) { INFERENCE_SLOT.release(); return false; }
    nextInferenceNs = capturedNs + INFERENCE_INTERVAL_NS;
    return true;
  }

  private void submitInference(VideoFrame.I420Buffer input, int rotation, long capturedNs) {
    if (closed) { finishInference(); return; }
    if (observation == null) update("starting", "Detecting the subject on this device");
    try {
      int width = input.getWidth(), height = input.getHeight();
      // A private byte array outlives this callback without retaining a WebRTC frame.
      byte[] nv21 = EffectMath.toNv21(width, height, input.getDataY(), input.getStrideY(),
          input.getDataU(), input.getStrideU(), input.getDataV(), input.getStrideV());
      inferenceExecutor.execute(() -> infer(nv21, width, height, rotation, capturedNs));
    } catch (RuntimeException | LinkageError | OutOfMemoryError failure) {
      failInference(); finishInference();
    }
  }

  private void infer(byte[] nv21, int width, int height, int rotation, long capturedNs) {
    if (closed) { finishInference(); return; }
    try {
      InputImage image = InputImage.fromByteArray(nv21, width, height, rotation, InputImage.IMAGE_FORMAT_NV21);
      if (effect.equals("studio-light")) {
        if (faceDetector == null) {
          faceDetector = FaceDetection.getClient(new FaceDetectorOptions.Builder()
              .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
              .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
              .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
              .enableTracking().build());
        }
        faceDetector.process(image).addOnCompleteListener(DIRECT, task -> {
          try {
            if (task.isSuccessful()) acceptFaces(task.getResult(), width, height, rotation, capturedNs);
            else failInference();
          } catch (RuntimeException | OutOfMemoryError failure) { failInference(); }
          finally { finishInference(); }
        });
      } else {
        if (segmenter == null) {
          segmenter = Segmentation.getClient(new SelfieSegmenterOptions.Builder()
              .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE).enableRawSizeMask().build());
        }
        segmenter.process(image).addOnCompleteListener(DIRECT, task -> {
          try {
            if (task.isSuccessful()) acceptMask(task.getResult(), width, height, rotation, capturedNs);
            else failInference();
          } catch (RuntimeException | OutOfMemoryError failure) { failInference(); }
          finally { finishInference(); }
        });
      }
    } catch (RuntimeException | LinkageError | OutOfMemoryError failure) {
      failInference(); finishInference();
    }
  }

  private void acceptFaces(List<Face> faces, int width, int height, int rotation, long capturedNs) {
    if (closed || nanoTime.getAsLong() - capturedNs > MAX_AGE_NS) return;
    Face selected = null;
    for (Face face : faces) {
      Rect box = face.getBoundingBox();
      if (selected == null || (long) box.width() * box.height()
          > (long) selected.getBoundingBox().width() * selected.getBoundingBox().height()) selected = face;
    }
    if (selected == null) {
      observation = null;
      update("starting", "Move into view for face-following lighting");
      return;
    }
    int uprightWidth = rotation % 180 == 0 ? width : height;
    int uprightHeight = rotation % 180 == 0 ? height : width;
    Rect box = selected.getBoundingBox();
    EffectMath.FaceRegion face = new EffectMath.FaceRegion(box.left / (float) uprightWidth,
        box.top / (float) uprightHeight, box.width() / (float) uprightWidth, box.height() / (float) uprightHeight);
    Observation old = observation;
    if (old != null && old.matches(width, height, rotation, capturedNs)) face = face.smooth(old.face);
    publish(new Observation(width, height, rotation, capturedNs, face, null, null));
  }

  private void acceptMask(SegmentationMask result, int width, int height, int rotation, long capturedNs) {
    if (closed || nanoTime.getAsLong() - capturedNs > MAX_AGE_NS) return;
    int maskWidth = result.getWidth(), maskHeight = result.getHeight();
    if (maskWidth < 2 || maskHeight < 2 || maskWidth > 2048 || maskHeight > 2048) { failInference(); return; }
    ByteBuffer buffer = result.getBuffer().duplicate().order(result.getBuffer().order());
    buffer.rewind();
    float[] values = new float[maskWidth * maskHeight];
    buffer.asFloatBuffer().get(values);
    EffectMath.Mask mask = new EffectMath.Mask(values, maskWidth, maskHeight);
    if (mask.coverage < .005f) {
      observation = null;
      update("starting", "Move into view for a subject-aware background");
      return;
    }
    EffectMath.Skyline skyline = null;
    if (effect.equals("chicago-skyline")) {
      Observation previous = observation;
      boolean freshHistory = previous != null && previous.mask != null
          && previous.matches(width, height, rotation, capturedNs);
      skylineCenterX = freshHistory ? EffectMath.smoothCentroid(skylineCenterX, mask.centroidX) : mask.centroidX;
      skylineCenterY = freshHistory ? EffectMath.smoothCentroid(skylineCenterY, mask.centroidY) : mask.centroidY;
      skyline = new EffectMath.Skyline(skylineCenterX, skylineCenterY, intensity);
    }
    publish(new Observation(width, height, rotation, capturedNs, null, mask, skyline));
  }

  private void publish(Observation next) {
    synchronized (stateLock) {
      if (!closed && nanoTime.getAsLong() - next.capturedNs <= MAX_AGE_NS) observation = next;
    }
  }

  private void failInference() {
    observation = null;
    nextInferenceNs = nanoTime.getAsLong() + 1_000_000_000L;
    update("unavailable", "On-device subject detection is unavailable; original video is continuing");
  }

  private void update(String nextState, String nextReason) {
    synchronized (stateLock) {
      if (!closed) { state = nextState; reason = nextReason; }
    }
  }

  private void finishInference() {
    if (inferenceInFlight.getAndSet(false)) INFERENCE_SLOT.release();
    if (closed) closeResources();
  }

  @Override public void close() {
    synchronized (stateLock) {
      if (closed) return;
      closed = true; observation = null; state = "off"; reason = null;
    }
    buffers.close();
    // Do not close an ML client while its task is in flight. That task holds
    // only its private NV21 bytes and will dispose the clients on completion.
    if (!inferenceInFlight.get()) closeResources();
  }

  private synchronized void closeResources() {
    try {
      if (faceDetector != null) faceDetector.close();
    } catch (RuntimeException ignored) {
      // Cleanup still proceeds if a vendor client has already released itself.
    } finally {
      faceDetector = null;
      try {
        if (segmenter != null) segmenter.close();
      } catch (RuntimeException ignored) {
        // No subject, frame or track data is logged during cleanup.
      } finally {
        segmenter = null;
        inferenceExecutor.shutdown();
      }
    }
  }
}
