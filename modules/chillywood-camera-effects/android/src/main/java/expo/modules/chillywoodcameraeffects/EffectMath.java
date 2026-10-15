package expo.modules.chillywoodcameraeffects;

import java.nio.ByteBuffer;

/** Platform-independent YUV compositor. Coordinates are normalized and upright. */
public final class EffectMath {
  private EffectMath() {}

  public static final class FaceRegion {
    public final float x, y, width, height;
    public FaceRegion(float x, float y, float width, float height) {
      this.x = x; this.y = y; this.width = width; this.height = height;
    }
    public FaceRegion smooth(FaceRegion previous) {
      if (previous == null) return this;
      // Avoid lag when a new face enters or the subject moves substantially.
      if (Math.abs(x - previous.x) + Math.abs(y - previous.y) > 0.2f) return this;
      return new FaceRegion(mix(previous.x, x, .65f), mix(previous.y, y, .65f),
          mix(previous.width, width, .65f), mix(previous.height, height, .65f));
    }
    public float weight(float ux, float uy) {
      float dx = (ux - x - width * .48f) / Math.max(.01f, width * .8f);
      float dy = (uy - y - height * .48f) / Math.max(.01f, height * .85f);
      float radial = Math.max(0f, 1f - dx * dx - dy * dy);
      // A broad key light follows the face rather than a fixed screen vignette.
      return radial * radial * clamp(.88f - dx * .15f - dy * .08f, .5f, 1f);
    }
  }

  public static final class Mask {
    public final float[] values;
    private final float[] outsideDistance;
    public final int width, height;
    public final float centroidX, centroidY, coverage;
    public Mask(float[] values, int width, int height) {
      if (width < 2 || height < 2 || values.length != width * height) {
        throw new IllegalArgumentException("Invalid segmentation dimensions");
      }
      this.values = values; this.width = width; this.height = height;
      outsideDistance = new float[values.length];
      double sum = 0, sx = 0, sy = 0;
      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int i = y * width + x;
          float alpha = Float.isFinite(values[i]) ? clamp(values[i], 0f, 1f) : 0f;
          values[i] = alpha;
          outsideDistance[i] = alpha > .5f ? 0f : width + height;
          if (alpha > .5f) {
            sum += alpha; sx += (x + .5) * alpha; sy += (y + .5) * alpha;
          }
        }
      }
      coverage = (float) (sum / (width * height));
      centroidX = sum > 0 ? (float) (sx / sum / width) : .5f;
      centroidY = sum > 0 ? (float) (sy / sum / height) : .5f;
      // Two-pass chamfer distance, bounded by mask size. This supports broad
      // halos and clean outer contours without coloring facial skin or clothes.
      for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
        int i = y * width + x; float d = outsideDistance[i];
        if (x > 0) d = Math.min(d, outsideDistance[i - 1] + 1f);
        if (y > 0) {
          d = Math.min(d, outsideDistance[i - width] + 1f);
          if (x > 0) d = Math.min(d, outsideDistance[i - width - 1] + 1.414214f);
          if (x + 1 < width) d = Math.min(d, outsideDistance[i - width + 1] + 1.414214f);
        }
        outsideDistance[i] = d;
      }
      for (int y = height - 1; y >= 0; y--) for (int x = width - 1; x >= 0; x--) {
        int i = y * width + x; float d = outsideDistance[i];
        if (x + 1 < width) d = Math.min(d, outsideDistance[i + 1] + 1f);
        if (y + 1 < height) {
          d = Math.min(d, outsideDistance[i + width] + 1f);
          if (x > 0) d = Math.min(d, outsideDistance[i + width - 1] + 1.414214f);
          if (x + 1 < width) d = Math.min(d, outsideDistance[i + width + 1] + 1.414214f);
        }
        outsideDistance[i] = d;
      }
    }
    public float sample(float ux, float uy) {
      float px = clamp(ux * width - .5f, 0f, width - 1f);
      float py = clamp(uy * height - .5f, 0f, height - 1f);
      int x = (int) px, y = (int) py;
      int nx = Math.min(x + 1, width - 1), ny = Math.min(y + 1, height - 1);
      float alpha = mix(mix(values[y * width + x], values[y * width + nx], px - x),
          mix(values[ny * width + x], values[ny * width + nx], px - x), py - y);
      // Soft confidence transition preserves hair edges without hard cutouts.
      float t = clamp((alpha - .08f) / .84f, 0f, 1f);
      return t * t * (3f - 2f * t);
    }
    public float distance(float ux, float uy) {
      int x = Math.min(width - 1, Math.max(0, (int) (ux * width)));
      int y = Math.min(height - 1, Math.max(0, (int) (uy * height)));
      return outsideDistance[y * width + x];
    }
  }

  /** Original procedural artwork; no downloaded media or camera image retained. */
  public static final class Skyline {
    private static final int SIZE = 256;
    private static final int[] FAR = makeLayer(false);
    private static final int[] NEAR = makeLayer(true);
    private final int[] yuv = new int[SIZE * SIZE];

    public Skyline(float centroidX, float centroidY, float intensity) {
      float dx = clamp((centroidX - .5f) * 18f * intensity, -9f, 9f);
      float dy = clamp((centroidY - .5f) * 10f * intensity, -5f, 5f);
      for (int y = 0; y < SIZE; y++) {
        for (int x = 0; x < SIZE; x++) {
          float horizon = (float) y / SIZE;
          int r = (int) mix(30, 201, horizon);
          int g = (int) mix(32, 112, horizon);
          int b = (int) mix(76, 119, horizon);
          int color = (r << 16) | (g << 8) | b;
          float sunX = x - SIZE * .77f, sunY = y - SIZE * .34f;
          if (sunX * sunX + sunY * sunY < 18 * 18) color = 0xf8c98e;
          int far = layerAt(FAR, x + dx * .4f, y + dy * .4f);
          int near = layerAt(NEAR, x + dx, y + dy);
          if (far != 0) color = far;
          if (near != 0) color = near;
          if (y > SIZE * .85f) {
            // Lakefront foreground with restrained horizontal reflections.
            color = ((x + y / 3) % 37 < 8 && y % 9 < 2) ? 0x77617d : 0x243a55;
          }
          yuv[y * SIZE + x] = rgbToYuv(color);
        }
      }
    }
    public int sample(float ux, float uy) {
      int x = Math.min(SIZE - 1, Math.max(0, (int) (ux * SIZE)));
      int y = Math.min(SIZE - 1, Math.max(0, (int) (uy * SIZE)));
      return yuv[y * SIZE + x];
    }
    private static int layerAt(int[] pixels, float x, float y) {
      int px = Math.min(SIZE - 1, Math.max(0, Math.round(x)));
      int py = Math.min(SIZE - 1, Math.max(0, Math.round(y)));
      return pixels[py * SIZE + px];
    }
    private static int[] makeLayer(boolean front) {
      int[] pixels = new int[SIZE * SIZE];
      int color = front ? 0x252943 : 0x605579;
      int base = front ? 220 : 208;
      int[] heights = front ? new int[]{37, 55, 47, 72, 49, 60, 42, 67, 44, 52, 69, 39}
          : new int[]{61, 88, 68, 103, 72, 94, 77, 58, 87, 73, 92, 59, 80, 66};
      int step = SIZE / heights.length;
      for (int i = 0; i < heights.length; i++) {
        int left = i * step - 3, top = base - heights[i];
        rect(pixels, left, top, left + step - 2, base, color);
        for (int y = top + 5; y < base; y += 9) {
          for (int x = left + 4; x < left + step - 3; x += 6) {
            if ((x + y + i) % 5 != 0) rect(pixels, x, y, x + 2, y + 2, front ? 0xc59e84 : 0xa28aa2);
          }
        }
      }
      if (front) {
        // Willis-inspired stepped bundled towers and twin antennae.
        rect(pixels, 45, 75, 57, base, color);
        rect(pixels, 56, 55, 73, base, color);
        rect(pixels, 72, 91, 83, base, color);
        rect(pixels, 58, 31, 60, 57, color);
        rect(pixels, 69, 29, 71, 57, color);
        for (int y = 65; y < base; y += 8) rect(pixels, 59, y, 70, y + 1, 0x806b77);
        // Hancock-inspired tapered silhouette, twin masts and X bracing.
        for (int y = 73; y < base; y++) {
          int half = 7 + (y - 73) / 20;
          rect(pixels, 195 - half, y, 195 + half, y + 1, color);
          int brace = (y - 73) % 28;
          int bx = (int) ((brace / 27f) * half * 2);
          rect(pixels, 195 - half + bx, y, 197 - half + bx, y + 1, 0x877b90);
          rect(pixels, 195 + half - bx, y, 197 + half - bx, y + 1, 0x877b90);
        }
        rect(pixels, 188, 48, 190, 75, color);
        rect(pixels, 201, 48, 203, 75, color);
      }
      return pixels;
    }
    private static void rect(int[] a, int x0, int y0, int x1, int y1, int color) {
      for (int y = Math.max(0, y0); y < Math.min(SIZE, y1); y++) {
        for (int x = Math.max(0, x0); x < Math.min(SIZE, x1); x++) a[y * SIZE + x] = color;
      }
    }
  }

  public static float uprightX(float x, float y, int rotation) {
    switch (rotation) { case 90: return 1f - y; case 180: return 1f - x; case 270: return y; default: return x; }
  }
  public static float uprightY(float x, float y, int rotation) {
    switch (rotation) { case 90: return x; case 180: return 1f - y; case 270: return 1f - x; default: return y; }
  }
  public static boolean validDimensions(int width, int height, int rotation) {
    return width >= 2 && height >= 2 && width % 2 == 0 && height % 2 == 0
        && Math.max(width, height) <= 1280 && Math.min(width, height) <= 720
        && width * height <= 1280 * 720
        && (rotation == 0 || rotation == 90 || rotation == 180 || rotation == 270);
  }

  public static byte[] toNv21(int width, int height, ByteBuffer y, int sy,
      ByteBuffer u, int su, ByteBuffer v, int sv) {
    byte[] result = new byte[width * height * 3 / 2];
    for (int row = 0; row < height; row++) {
      for (int col = 0; col < width; col++) result[row * width + col] = y.get(row * sy + col);
    }
    int i = width * height;
    for (int row = 0; row < height / 2; row++) {
      for (int col = 0; col < width / 2; col++) {
        result[i++] = v.get(row * sv + col); result[i++] = u.get(row * su + col);
      }
    }
    return result;
  }

  public static void composite(int width, int height, int rotation, float intensity,
      ByteBuffer y, int sy, ByteBuffer u, int su, ByteBuffer v, int sv,
      ByteBuffer outY, int oy, ByteBuffer outU, int ou, ByteBuffer outV, int ov,
      FaceRegion face, Mask mask, Skyline skyline) {
    composite(width, height, rotation, intensity, y, sy, u, su, v, sv, outY, oy, outU, ou, outV, ov,
        face, mask, skyline, face != null ? "studio-light" : "chicago-skyline", 0L);
  }

  public static void composite(int width, int height, int rotation, float intensity,
      ByteBuffer y, int sy, ByteBuffer u, int su, ByteBuffer v, int sv,
      ByteBuffer outY, int oy, ByteBuffer outU, int ou, ByteBuffer outV, int ov,
      FaceRegion face, Mask mask, Skyline skyline, String effect, long timestampNs) {
    int mode = effect.equals("crimson-aura") ? 2 : effect.equals("neon-edge") ? 3 : effect.equals("spotlight") ? 4 : 1;
    double phase = (timestampNs % 12_000_000_000L) / 12_000_000_000.0 * Math.PI * 2;
    float spotX = .5f + .23f * (float) Math.sin(phase), spotY = .40f + .16f * (float) Math.cos(phase);
    int spotColor = mixYuv(rgbToYuv(0x718cff), rgbToYuv(0xff779f), .5f + .5f * (float) Math.sin(phase));
    float lift = 0f;
    if (face != null) {
      double total = 0, weight = 0;
      int step = Math.max(2, Math.max(width, height) / 64);
      for (int row = 0; row < height; row += step) {
        for (int col = 0; col < width; col += step) {
          float rx = (col + .5f) / width, ry = (row + .5f) / height;
          float w = face.weight(uprightX(rx, ry, rotation), uprightY(rx, ry, rotation));
          total += (y.get(row * sy + col) & 255) * w; weight += w;
        }
      }
      float mean = weight > 0 ? (float) (total / weight) : 155f;
      lift = clamp((155f - mean) * .7f, 3f, 42f) * intensity;
    }
    for (int row = 0; row < height; row++) {
      for (int col = 0; col < width; col++) {
        float rx = (col + .5f) / width, ry = (row + .5f) / height;
        float ux = uprightX(rx, ry, rotation), uy = uprightY(rx, ry, rotation);
        int original = y.get(row * sy + col) & 255;
        float result = original;
        if (face != null) {
          result += lift * face.weight(ux, uy) * clamp((235f - original) / 110f, 0f, 1f);
        } else if (mask != null) {
          float alpha = mask.sample(ux, uy);
          if (mode == 1 && skyline != null) {
            float foreground = 1f - (1f - alpha) * intensity;
            result = mix((skyline.sample(ux, uy) >> 16) & 255, original, foreground);
          } else if (mode == 4) {
            float dark = 16f + (original - 16f) * (1f - .76f * intensity);
            float background = clamp(dark + spotlight(ux, uy, spotX, spotY) * intensity * 155f, 16f, 235f);
            result = mix(background, original, alpha);
          } else if (mode == 2 || mode == 3) {
            float blend = alpha < 1f ? outsideStrength(mask, ux, uy, mode, intensity) * (1f - alpha) : 0f;
            if (blend > 0f) result = mix(original, ((accentColor(ux, uy, mode) >> 16) & 255) + 20f, blend);
          }
        }
        outY.put(row * oy + col, (byte) Math.round(clamp(result, 0f, 255f)));
      }
    }
    for (int row = 0; row < height / 2; row++) {
      for (int col = 0; col < width / 2; col++) {
        float rx = (col * 2 + 1f) / width, ry = (row * 2 + 1f) / height;
        float ux = uprightX(rx, ry, rotation), uy = uprightY(rx, ry, rotation);
        float ru = u.get(row * su + col) & 255, rv = v.get(row * sv + col) & 255;
        if (face != null) {
          float warmth = face.weight(ux, uy) * intensity;
          ru -= 1.5f * warmth; rv += 2f * warmth;
        } else if (mask != null) {
          float alpha = mask.sample(ux, uy);
          if (mode == 1 && skyline != null) {
            int bg = skyline.sample(ux, uy);
            float foreground = 1f - (1f - alpha) * intensity;
            ru = mix((bg >> 8) & 255, ru, foreground); rv = mix(bg & 255, rv, foreground);
          } else if (mode == 4) {
            float glow = spotlight(ux, uy, spotX, spotY) * intensity;
            float bu = mix(ru, 128f, intensity * .35f), bv = mix(rv, 128f, intensity * .35f);
            bu = mix(bu, (spotColor >> 8) & 255, glow); bv = mix(bv, spotColor & 255, glow);
            ru = mix(bu, ru, alpha); rv = mix(bv, rv, alpha);
          } else if (mode == 2 || mode == 3) {
            float blend = alpha < 1f ? outsideStrength(mask, ux, uy, mode, intensity) * (1f - alpha) : 0f;
            if (blend > 0f) {
              int accent = accentColor(ux, uy, mode);
              ru = mix(ru, (accent >> 8) & 255, blend); rv = mix(rv, accent & 255, blend);
            }
          }
        }
        outU.put(row * ou + col, (byte) Math.round(clamp(ru, 0f, 255f)));
        outV.put(row * ov + col, (byte) Math.round(clamp(rv, 0f, 255f)));
      }
    }
  }

  private static final int CRIMSON = rgbToYuv(0xff1744);
  private static final int CYAN = rgbToYuv(0x39ffe7);
  private static final int MAGENTA = rgbToYuv(0xff28da);
  private static int accentColor(float ux, float uy, int mode) {
    return mode == 2 ? CRIMSON : mixYuv(CYAN, MAGENTA, clamp((ux + 1f - uy) * .5f, 0f, 1f));
  }
  private static int mixYuv(int a, int b, float t) {
    return (Math.round(mix((a >> 16) & 255, (b >> 16) & 255, t)) << 16)
        | (Math.round(mix((a >> 8) & 255, (b >> 8) & 255, t)) << 8)
        | Math.round(mix(a & 255, b & 255, t));
  }
  private static float outsideStrength(Mask mask, float ux, float uy, int mode, float intensity) {
    if (intensity <= 0f) return 0f;
    float radius = Math.max(2f, Math.min(mask.width, mask.height) * (mode == 2 ? .12f : .03f));
    float falloff = clamp(1f - mask.distance(ux, uy) / radius, 0f, 1f);
    return (mode == 2 ? falloff * falloff : (float) Math.sqrt(falloff)) * (.2f + .8f * intensity);
  }
  private static float spotlight(float ux, float uy, float cx, float cy) {
    float dx = (ux - cx) / .36f, dy = (uy - cy) / .47f;
    float glow = clamp(1f - dx * dx - dy * dy, 0f, 1f);
    return glow * glow;
  }

  public static int rgbToYuv(int rgb) {
    int r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    int y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
    int u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
    int v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
    return (y << 16) | (u << 8) | v;
  }
  public static float clamp(float v, float min, float max) { return Math.max(min, Math.min(max, v)); }
  public static float smoothCentroid(float previous, float measured) {
    return mix(clamp(previous, 0f, 1f), clamp(measured, 0f, 1f), .25f);
  }
  private static float mix(float a, float b, float t) { return a + (b - a) * t; }
}
