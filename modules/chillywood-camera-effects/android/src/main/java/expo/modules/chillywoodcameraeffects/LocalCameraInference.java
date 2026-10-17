package expo.modules.chillywoodcameraeffects;

import android.content.res.AssetManager;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import org.tensorflow.lite.DataType;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.InterpreterApi;

/** Bundled, hash-verified models and application-owned CPU inference only. */
final class LocalCameraInference implements AutoCloseable {
  static final String FACE_ASSET = "chillywood_models/blaze_face_short_range.tflite";
  static final String MASK_ASSET = "chillywood_models/selfie_segmenter.tflite";
  static final String FACE_SHA256 = "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f";
  static final String MASK_SHA256 = "191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b";
  private final Interpreter interpreter;
  private final boolean faceMode;
  private final ByteBuffer input;
  private final float[][][] faceBoxes;
  private final float[][][] faceScores;
  private final ByteBuffer maskValues;

  LocalCameraInference(AssetManager assets, boolean faceMode) {
    this(readModel(assets, faceMode ? FACE_ASSET : MASK_ASSET,
        faceMode ? FACE_SHA256 : MASK_SHA256), faceMode);
  }

  // Also used by credential-free, network-disabled exact-artifact acceptance tests.
  LocalCameraInference(ByteBuffer model, boolean faceMode) {
    this.faceMode = faceMode;
    faceBoxes = faceMode ? new float[1][896][16] : null;
    faceScores = faceMode ? new float[1][896][1] : null;
    maskValues = faceMode ? null : ByteBuffer.allocateDirect(256 * 256 * Float.BYTES).order(ByteOrder.nativeOrder());
    Interpreter.Options options = new Interpreter.Options()
        .setRuntime(InterpreterApi.Options.TfLiteRuntime.FROM_APPLICATION_ONLY)
        .setUseXNNPACK(true).setUseNNAPI(false).setNumThreads(2);
    Interpreter created = new Interpreter(model, options);
    try {
      created.allocateTensors();
      int size = faceMode ? 128 : 256;
      requireTensor(created.getInputTensor(0).dataType(), created.getInputTensor(0).shape(), 1, size, size, 3);
      if (created.getInputTensorCount() != 1 || created.getOutputTensorCount() != (faceMode ? 2 : 1)) {
        throw new IllegalArgumentException("Unexpected local model signature");
      }
      if (faceMode) {
        requireTensor(created.getOutputTensor(0).dataType(), created.getOutputTensor(0).shape(), 1, 896, 16);
        requireTensor(created.getOutputTensor(1).dataType(), created.getOutputTensor(1).shape(), 1, 896, 1);
      } else requireTensor(created.getOutputTensor(0).dataType(), created.getOutputTensor(0).shape(), 1, 256, 256, 1);
      input = ByteBuffer.allocateDirect(size * size * 3 * Float.BYTES).order(ByteOrder.nativeOrder());
      interpreter = created;
    } catch (RuntimeException | LinkageError | OutOfMemoryError failure) {
      created.close(); throw failure;
    }
  }

  EffectMath.FaceRegion detectFace(byte[] nv21, int width, int height, int rotation) {
    if (!faceMode) throw new IllegalStateException("Wrong local detector");
    LocalInferenceMath.input(nv21, width, height, rotation, 128, true, input);
    Map<Integer, Object> output = new HashMap<>();
    output.put(0, faceBoxes); output.put(1, faceScores);
    interpreter.runForMultipleInputsOutputs(new Object[] {input}, output);
    float[] scores = new float[896];
    for (int i = 0; i < scores.length; i++) scores[i] = faceScores[0][i][0];
    return LocalInferenceMath.face(faceBoxes[0], scores, width, height, rotation);
  }

  EffectMath.Mask segment(byte[] nv21, int width, int height, int rotation) {
    if (faceMode) throw new IllegalStateException("Wrong local detector");
    LocalInferenceMath.input(nv21, width, height, rotation, 256, false, input);
    maskValues.clear();
    interpreter.run(input, maskValues);
    maskValues.rewind();
    float[] values = new float[256 * 256];
    for (int y = 0; y < 256; y++) for (int x = 0; x < 256; x++) {
      float v = maskValues.getFloat();
      if (!Float.isFinite(v) || v < 0 || v > 1) throw new IllegalStateException("Invalid local person confidence");
      values[y * 256 + x] = v;
    }
    return new EffectMath.Mask(values, 256, 256);
  }

  private static void requireTensor(DataType type, int[] actual, int... expected) {
    if (type != DataType.FLOAT32 || !Arrays.equals(actual, expected)) throw new IllegalArgumentException("Unexpected local model tensor");
  }

  private static ByteBuffer readModel(AssetManager assets, String path, String hash) {
    if (assets == null) throw new IllegalStateException("Bundled model assets are unavailable");
    try (InputStream stream = assets.open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[8192]; int count;
      while ((count = stream.read(chunk)) != -1) {
        if (out.size() + count > 1_000_000) throw new IOException("Oversized bundled model");
        out.write(chunk, 0, count);
      }
      return verifiedModel(out.toByteArray(), hash);
    } catch (IOException failure) { throw new IllegalStateException("Bundled model unavailable", failure); }
  }

  static ByteBuffer verifiedModel(byte[] bytes, String hash) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
      StringBuilder actual = new StringBuilder();
      for (byte value : digest) actual.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
      if (!actual.toString().equals(hash)) throw new IllegalArgumentException("Bundled model integrity check failed");
      ByteBuffer model = ByteBuffer.allocateDirect(bytes.length).order(ByteOrder.nativeOrder());
      model.put(bytes).rewind(); return model;
    } catch (NoSuchAlgorithmException failure) { throw new IllegalStateException(failure); }
  }
  @Override public void close() { interpreter.close(); }
}
