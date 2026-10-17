package expo.modules.chillywoodcameraeffects;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

public final class LocalInferenceMathTest {
  private static int assertions;
  private static void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
  private static void near(float a, float b, String message) { check(Math.abs(a - b) < .0001f, message + ": " + a + " vs " + b); }
  private static ByteBuffer buffer(int size) { return ByteBuffer.allocateDirect(size * size * 12).order(ByteOrder.nativeOrder()); }
  public static void main(String[] args) {
    byte[] frame = new byte[24]; Arrays.fill(frame, (byte) 128);
    Arrays.fill(frame, 0, 16, (byte) 16);
    ByteBuffer input = buffer(4);
    LocalInferenceMath.input(frame, 4, 4, 0, 4, false, input);
    for (int i = 0; i < 48; i++) near(input.getFloat(), 0, "limited-range black RGB");
    Arrays.fill(frame, 0, 16, (byte) 235);
    LocalInferenceMath.input(frame, 4, 4, 0, 4, true, input);
    for (int i = 0; i < 48; i++) near(input.getFloat(), 1, "face normalization white RGB");
    // Asymmetric NV21 V/U catches channel-order and chroma-order regressions.
    Arrays.fill(frame, 0, 16, (byte) 81);
    for (int i = 16; i < 24; i += 2) { frame[i] = (byte) 240; frame[i + 1] = (byte) 90; }
    LocalInferenceMath.input(frame, 4, 4, 0, 4, false, input);
    for (int i = 0; i < 16; i++) {
      near(input.getFloat(), .9978036f, "red fixture R");
      near(input.getFloat(), 0, "red fixture G");
      near(input.getFloat(), 0, "red fixture B");
    }
    Arrays.fill(frame, 16, 24, (byte) 128);
    // Asymmetric luma quadrants, neutral chroma: exact inverse rotation.
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) frame[y * 4 + x] = (byte) (30 + y * 40 + x * 5);
    float[][] outputs = new float[4][48]; int[] rotations = {0, 90, 180, 270};
    for (int r = 0; r < 4; r++) {
      LocalInferenceMath.input(frame, 4, 4, rotations[r], 4, false, input);
      input.asFloatBuffer().get(outputs[r]);
      for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
        int ux = Math.min(3, (int) (EffectMath.uprightX((x + .5f) / 4, (y + .5f) / 4, rotations[r]) * 4));
        int uy = Math.min(3, (int) (EffectMath.uprightY((x + .5f) / 4, (y + .5f) / 4, rotations[r]) * 4));
        near(outputs[r][(uy * 4 + ux) * 3], outputs[0][(y * 4 + x) * 3], "rotation agrees with mask compositor");
      }
    }
    byte[] wide = new byte[48]; Arrays.fill(wide, (byte) 128); Arrays.fill(wide, 0, 32, (byte) 235);
    LocalInferenceMath.input(wide, 8, 4, 0, 4, true, input);
    near(input.getFloat(0), -1, "face letterbox is black");
    near(input.getFloat(4 * 3 * 4), 1, "letterbox center retains image");
    LocalInferenceMath.input(wide, 8, 4, 0, 4, false, input);
    near(input.getFloat(0), 1, "segmentation stretches without letterbox");
    try { LocalInferenceMath.input(new byte[1], 4, 4, 0, 4, false, input); throw new AssertionError("bad input accepted"); }
    catch (IllegalArgumentException expected) { assertions++; }

    float[][] boxes = new float[896][16]; float[] logits = new float[896]; Arrays.fill(logits, -100);
    check(LocalInferenceMath.face(boxes, logits, 8, 4, 0) == null, "no detections stays absent");
    // Anchor zero at 1/32: predict square center .5,.5 and width/height .25.
    boxes[0][0] = 60; boxes[0][1] = 60; boxes[0][2] = 32; boxes[0][3] = 32; logits[0] = 10;
    EffectMath.FaceRegion face = LocalInferenceMath.face(boxes, logits, 8, 4, 0);
    near(face.x, .375f, "face x unletterboxed"); near(face.y, .25f, "face y unletterboxed");
    near(face.width, .25f, "face width"); near(face.height, .5f, "face height");
    face = LocalInferenceMath.face(boxes, logits, 8, 4, 90);
    near(face.x, .25f, "portrait face x"); near(face.y, .375f, "portrait face y");
    boxes[1] = boxes[0].clone(); logits[1] = 10;
    face = LocalInferenceMath.face(boxes, logits, 8, 4, 0);
    near(face.x, .375f, "weighted suppression merges duplicate anchor");
    boxes[0][0] = Float.NaN; boxes[1][2] = -1;
    check(LocalInferenceMath.face(boxes, logits, 8, 4, 0) == null, "malformed detections discarded");
    System.out.println("Local inference math: " + assertions + " assertions passed");
  }
}
