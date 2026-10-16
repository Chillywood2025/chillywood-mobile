package expo.modules.chillywoodcameraeffects;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import org.json.JSONObject;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.InterpreterApi;

/** An emulator-only test process. No activity, camera, account, network or real image input. */
public final class OfflineInferenceInstrumentation extends Instrumentation {
  private int checks;
  private int faceInvocations;
  private int maskInvocations;

  @Override public void onCreate(Bundle arguments) {
    super.onCreate(arguments);
    start();
  }

  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      Context context = getTargetContext();
      assertIsolatedPackage(context);
      byte[] faceBytes = asset(context, LocalCameraInference.FACE_ASSET);
      byte[] maskBytes = asset(context, LocalCameraInference.MASK_ASSET);
      LocalCameraInference.verifiedModel(faceBytes, LocalCameraInference.FACE_SHA256);
      LocalCameraInference.verifiedModel(maskBytes, LocalCameraInference.MASK_SHA256);
      check(true, "Both exact production model hashes verified");
      rejectsCorruption(faceBytes, LocalCameraInference.FACE_SHA256);
      rejectsCorruption(maskBytes, LocalCameraInference.MASK_SHA256);
      rejectsWrongSignature(faceBytes);
      requiresXnnpackForCustomOp(maskBytes);

      // AssetManager constructor, preprocessing, decoder and result validation
      // are the production implementations, compiled unchanged into this APK.
      try (LocalCameraInference face = new LocalCameraInference(context.getAssets(), true);
           LocalCameraInference mask = new LocalCameraInference(context.getAssets(), false)) {
        for (int rotation : new int[] {0, 90, 180, 270}) {
          for (boolean pattern : new boolean[] {false, true}) {
            byte[] frame = syntheticNv21(128, 96, pattern);
            byte[] before = frame.clone();
            EffectMath.FaceRegion region = face.detectFace(frame, 128, 96, rotation);
            faceInvocations++;
            if (!pattern) check(region == null, "A blank synthetic frame must not invent a face");
            if (region != null) {
              check(Float.isFinite(region.x) && Float.isFinite(region.y)
                  && Float.isFinite(region.width) && Float.isFinite(region.height), "Finite face bounds");
              check(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0
                  && region.x + region.width <= 1.00001f && region.y + region.height <= 1.00001f,
                  "Normalized face bounds");
            }
            EffectMath.Mask first = mask.segment(frame, 128, 96, rotation);
            maskInvocations++;
            check(first.width == 256 && first.height == 256 && first.values.length == 65536,
                "Exact segmentation tensor shape");
            for (float value : first.values) {
              check(Float.isFinite(value) && value >= 0 && value <= 1, "Finite person confidence in [0,1]");
            }
            float[] firstValues = first.values.clone();
            EffectMath.Mask repeat = mask.segment(frame, 128, 96, rotation);
            maskInvocations++;
            for (int i = 0; i < firstValues.length; i++) {
              check(Math.abs(firstValues[i] - repeat.values[i]) <= .00001f,
                  "Repeated CPU inference is numerically stable");
            }
            check(Arrays.equals(frame, before), "Production inference does not mutate its source frame");
          }
        }
      }
      check(faceInvocations == 8 && maskInvocations == 16, "All synthetic cases really invoked native inference");
      JSONObject report = new JSONObject();
      report.put("scope", "isolated-android-x86_64-production-adapter-inference");
      report.put("runtime", "standalone-litert-1.4.1-application-only-xnnpack");
      report.put("faceSha256", LocalCameraInference.FACE_SHA256);
      report.put("maskSha256", LocalCameraInference.MASK_SHA256);
      report.put("checks", checks);
      report.put("faceInvocations", faceInvocations);
      report.put("maskInvocations", maskInvocations);
      report.put("customOpWithoutXnnpackRejected", true);
      report.put("corruptModelsRejected", true);
      report.put("internetPermission", false);
      report.put("syntheticInputsOnly", true);
      report.put("physicalDeviceEvidence", false);
      report.put("visualSubjectQualityEvidence", false);
      result.putString("stream", "\nCHILLYWOOD_LOCAL_INFERENCE_PASS " + report + "\n");
      finish(Activity.RESULT_OK, result);
    } catch (Throwable failure) {
      String message = String.valueOf(failure.getMessage());
      if (message.length() > 600) message = message.substring(0, 600);
      result.putString("stream", "\nCHILLYWOOD_LOCAL_INFERENCE_FAIL "
          + failure.getClass().getName() + ": " + message + "\n");
      finish(Activity.RESULT_CANCELED, result);
    }
  }

  private void assertIsolatedPackage(Context context) throws Exception {
    PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(),
        PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES | PackageManager.GET_PROVIDERS
            | PackageManager.GET_RECEIVERS | PackageManager.GET_ACTIVITIES);
    check(info.requestedPermissions == null || info.requestedPermissions.length == 0,
        "The installed test package must request no permissions");
    check(context.checkCallingOrSelfPermission("android.permission.INTERNET") == PackageManager.PERMISSION_DENIED,
        "The inference UID has no Internet permission");
    check((info.applicationInfo.flags & ApplicationInfo.FLAG_TEST_ONLY) != 0, "Only a test-only APK may run");
    check(info.services == null && info.providers == null && info.receivers == null && info.activities == null,
        "No services, providers, receivers or activities are installed");
    try {
      context.getPackageManager().getPackageInfo("com.google.android.gms", 0);
      throw new AssertionError("AOSP emulator must not include Google Play services");
    } catch (PackageManager.NameNotFoundException expected) {
      checks++;
    }
  }

  private void rejectsCorruption(byte[] original, String hash) {
    byte[] corrupt = original.clone();
    corrupt[corrupt.length / 2] ^= 1;
    try {
      LocalCameraInference.verifiedModel(corrupt, hash);
      throw new AssertionError("Corrupted bundled model must fail before native creation");
    } catch (IllegalArgumentException expected) {
      check(expected.getMessage().contains("integrity"), "Hash failure is explicit");
    }
  }

  private void rejectsWrongSignature(byte[] faceBytes) {
    try (LocalCameraInference ignored = new LocalCameraInference(
        LocalCameraInference.verifiedModel(faceBytes, LocalCameraInference.FACE_SHA256), false)) {
      throw new AssertionError("A face model must not be accepted as a segmenter");
    } catch (IllegalArgumentException expected) {
      check(expected.getMessage().contains("model"), "Wrong tensor contract fails closed");
    }
  }

  private void requiresXnnpackForCustomOp(byte[] maskBytes) {
    Interpreter control = null;
    try {
      ByteBuffer model = LocalCameraInference.verifiedModel(maskBytes, LocalCameraInference.MASK_SHA256);
      control = new Interpreter(model, new Interpreter.Options()
          .setRuntime(InterpreterApi.Options.TfLiteRuntime.FROM_APPLICATION_ONLY)
          .setUseXNNPACK(false).setUseNNAPI(false).setNumThreads(1));
      control.allocateTensors();
      throw new AssertionError("The custom-op control unexpectedly succeeded without XNNPACK");
    } catch (IllegalArgumentException | IllegalStateException expected) {
      check(String.valueOf(expected.getMessage()).contains("Convolution2DTransposeBias"),
          "Negative control must fail for the actual custom op");
    } finally {
      if (control != null) control.close();
    }
  }

  private byte[] asset(Context context, String path) throws Exception {
    try (InputStream input = context.getAssets().open(path);
         ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      byte[] block = new byte[8192];
      for (int count; (count = input.read(block)) != -1;) out.write(block, 0, count);
      return out.toByteArray();
    }
  }

  private static byte[] syntheticNv21(int width, int height, boolean pattern) {
    byte[] result = new byte[width * height * 3 / 2];
    Arrays.fill(result, width * height, result.length, (byte) 128);
    for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
      result[y * width + x] = (byte) (pattern ? 16 + ((x * 7 + y * 11) % 220) : 16);
    }
    return result;
  }

  private void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
    checks++;
  }
}
