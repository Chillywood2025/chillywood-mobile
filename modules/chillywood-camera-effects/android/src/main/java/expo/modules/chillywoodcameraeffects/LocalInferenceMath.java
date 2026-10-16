package expo.modules.chillywoodcameraeffects;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure preprocessing/BlazeFace decoding; no Android, network or model runtime. */
final class LocalInferenceMath {
  private LocalInferenceMath() {}
  private static final float[][] ANCHORS = anchors();

  // The face model uses square letterboxing; segmentation deliberately stretches
  // the upright frame, matching its published preprocessing graph.
  static void input(byte[] nv21, int width, int height, int rotation, int size,
      boolean face, ByteBuffer target) {
    if (!EffectMath.validDimensions(width, height, rotation)
        || nv21.length != width * height * 3 / 2
        || target.capacity() != size * size * 3 * Float.BYTES) {
      throw new IllegalArgumentException("Invalid inference input");
    }
    int uw = rotation % 180 == 0 ? width : height;
    int uh = rotation % 180 == 0 ? height : width;
    float scaleX = face ? uw / (float) Math.max(uw, uh) : 1f;
    float scaleY = face ? uh / (float) Math.max(uw, uh) : 1f;
    target.clear();
    for (int y = 0; y < size; y++) for (int x = 0; x < size; x++) {
      float ux = ((x + .5f) / size - (1f - scaleX) / 2f) / scaleX;
      float uy = ((y + .5f) / size - (1f - scaleY) / 2f) / scaleY;
      if (ux < 0 || ux >= 1 || uy < 0 || uy >= 1) {
        target.putFloat(-1f).putFloat(-1f).putFloat(-1f);
        continue;
      }
      float rx, ry;
      switch (rotation) {
        case 90: rx = uy; ry = 1f - ux; break;
        case 180: rx = 1f - ux; ry = 1f - uy; break;
        case 270: rx = 1f - uy; ry = ux; break;
        default: rx = ux; ry = uy;
      }
      // Bilinear luma/chroma sampling avoids nearest-neighbour aliasing at the
      // small model input. NV21 has V then U; WebRTC planes use limited-range YUV.
      float py = ry * height - .5f, px = rx * width - .5f;
      float yy = sample(nv21, width, height, 0, 1, px, py) - 16f;
      float vv = sample(nv21, width / 2, height / 2, width * height, 2,
          rx * width / 2f - .5f, ry * height / 2f - .5f) - 128f;
      float uu = sample(nv21, width / 2, height / 2, width * height + 1, 2,
          rx * width / 2f - .5f, ry * height / 2f - .5f) - 128f;
      float r = clamp(1.164384f * yy + 1.596027f * vv, 0, 255);
      float g = clamp(1.164384f * yy - .391762f * uu - .812968f * vv, 0, 255);
      float b = clamp(1.164384f * yy + 2.017232f * uu, 0, 255);
      float divisor = face ? 127.5f : 255f, offset = face ? 1f : 0f;
      target.putFloat(r / divisor - offset).putFloat(g / divisor - offset).putFloat(b / divisor - offset);
    }
    target.rewind();
  }

  private static float sample(byte[] data, int width, int height, int offset, int step, float x, float y) {
    x = clamp(x, 0, width - 1); y = clamp(y, 0, height - 1);
    int x0 = (int) x, y0 = (int) y, x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
    float a = data[offset + (y0 * width + x0) * step] & 255;
    float b = data[offset + (y0 * width + x1) * step] & 255;
    float c = data[offset + (y1 * width + x0) * step] & 255;
    float d = data[offset + (y1 * width + x1) * step] & 255;
    return (a + (b - a) * (x - x0)) * (1 - (y - y0)) + (c + (d - c) * (x - x0)) * (y - y0);
  }

  static EffectMath.FaceRegion face(float[][] boxes, float[] logits, int width, int height, int rotation) {
    if (boxes.length != 896 || logits.length != 896) throw new IllegalArgumentException("Invalid face output");
    List<float[]> candidates = new ArrayList<>();
    for (int i = 0; i < 896; i++) {
      if (boxes[i].length != 16) throw new IllegalArgumentException("Invalid face coordinates");
      if (!Float.isFinite(logits[i])) continue;
      float score = (float) (1 / (1 + Math.exp(-clamp(logits[i], -100, 100))));
      if (score < .5f) continue;
      float[] b = boxes[i];
      if (!Float.isFinite(b[0]) || !Float.isFinite(b[1]) || !Float.isFinite(b[2]) || !Float.isFinite(b[3])
          || b[2] <= 0 || b[3] <= 0) continue;
      float cx = b[0] / 128f + ANCHORS[i][0], cy = b[1] / 128f + ANCHORS[i][1];
      candidates.add(new float[] {cx - b[2] / 256f, cy - b[3] / 256f, b[2] / 128f, b[3] / 128f, score});
    }
    candidates.sort(Comparator.comparingDouble((float[] b) -> b[4]).reversed());
    float sx = (rotation % 180 == 0 ? width : height) / (float) Math.max(width, height);
    float sy = (rotation % 180 == 0 ? height : width) / (float) Math.max(width, height);
    EffectMath.FaceRegion selected = null;
    while (!candidates.isEmpty()) {
      float[] top = candidates.remove(0), sum = new float[4];
      float weight = top[4];
      for (int k = 0; k < 4; k++) sum[k] = top[k] * top[4];
      for (int i = candidates.size() - 1; i >= 0; i--) {
        float[] other = candidates.get(i);
        if (iou(top, other) > .3f) {
          candidates.remove(i); weight += other[4];
          for (int k = 0; k < 4; k++) sum[k] += other[k] * other[4];
        }
      }
      float left = clamp((sum[0] / weight - (1 - sx) / 2) / sx, 0, 1);
      float upper = clamp((sum[1] / weight - (1 - sy) / 2) / sy, 0, 1);
      float right = clamp(((sum[0] + sum[2]) / weight - (1 - sx) / 2) / sx, 0, 1);
      float lower = clamp(((sum[1] + sum[3]) / weight - (1 - sy) / 2) / sy, 0, 1);
      if (right <= left || lower <= upper) continue;
      EffectMath.FaceRegion next = new EffectMath.FaceRegion(left, upper, right - left, lower - upper);
      if (selected == null || next.width * next.height > selected.width * selected.height) selected = next;
    }
    return selected;
  }

  private static float iou(float[] a, float[] b) {
    float w = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
    float h = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    float intersection = w * h;
    return intersection / (a[2] * a[3] + b[2] * b[3] - intersection);
  }

  private static float[][] anchors() {
    float[][] result = new float[896][2]; int i = 0;
    // Fixed-size anchors: stride 8 has 2/cell; merged stride-16 layers have 6/cell.
    for (int grid : new int[] {16, 8}) for (int y = 0; y < grid; y++) for (int x = 0; x < grid; x++)
      for (int n = 0; n < (grid == 16 ? 2 : 6); n++) result[i++] = new float[] {(x + .5f) / grid, (y + .5f) / grid};
    return result;
  }
  private static float clamp(float v, float min, float max) { return Math.max(min, Math.min(max, v)); }
}
