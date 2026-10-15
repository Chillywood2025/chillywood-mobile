package expo.modules.chillywoodcameraeffects;

import java.nio.ByteBuffer;
import java.util.Arrays;

/** Runs with a JDK alone. Real-device capture/ML/SFU verification is additional. */
public final class EffectMathTest {
  private static int assertions;
  public static void main(String[] args) {
    dimensions(); rotations(); nv21Strides(); masks(); foregroundPreservation();
    rotatedBackground(); faceLighting(); skylineParallax(); skylineIntensity(); boldEffects();
    System.out.println("Camera effects math: " + assertions + " assertions passed");
  }
  private static void check(boolean condition, String message) {
    assertions++; if (!condition) throw new AssertionError(message);
  }
  private static void near(float actual, float expected, String message) {
    check(Math.abs(actual - expected) < .0001f, message + ": " + actual + " != " + expected);
  }
  private static void dimensions() {
    check(EffectMath.validDimensions(1280, 720, 0), "720p accepted");
    check(EffectMath.validDimensions(720, 1280, 90), "portrait 720p accepted");
    check(!EffectMath.validDimensions(1920, 1080, 0), "1080p rejected");
    check(!EffectMath.validDimensions(641, 480, 0), "odd width rejected");
    check(!EffectMath.validDimensions(640, 481, 0), "odd height rejected");
    check(!EffectMath.validDimensions(640, 480, 45), "invalid rotation rejected");
    check(!EffectMath.validDimensions(0, 480, 0), "empty image rejected");
  }
  private static void rotations() {
    int[] rotations = {0, 90, 180, 270};
    float[][] expected = {{.25f,.75f},{.25f,.25f},{.75f,.25f},{.75f,.75f}};
    for (int i = 0; i < rotations.length; i++) {
      near(EffectMath.uprightX(.25f, .75f, rotations[i]), expected[i][0], "upright x");
      near(EffectMath.uprightY(.25f, .75f, rotations[i]), expected[i][1], "upright y");
    }
  }
  private static void nv21Strides() {
    ByteBuffer y = ByteBuffer.wrap(new byte[]{1,2,3,4,99,99,5,6,7,8});
    ByteBuffer u = ByteBuffer.wrap(new byte[]{11,12,99});
    ByteBuffer v = ByteBuffer.wrap(new byte[]{21,22,99});
    byte[] result = EffectMath.toNv21(4, 2, y, 6, u, 3, v, 3);
    check(Arrays.equals(result, new byte[]{1,2,3,4,5,6,7,8,21,11,22,12}), "NV21 is Y then VU, no stride padding");
  }
  private static void masks() {
    EffectMath.Mask mask = new EffectMath.Mask(new float[]{0,1,0,1}, 2, 2);
    near(mask.sample(.25f,.25f), 0f, "background confidence");
    near(mask.sample(.75f,.25f), 1f, "foreground confidence");
    near(mask.sample(.5f,.5f), .5f, "bilinear edge is feathered");
    near(mask.centroidX, .75f, "centroid follows subject");
    near(mask.centroidY, .5f, "centroid y");
    EffectMath.Mask invalid = new EffectMath.Mask(new float[]{Float.NaN, -1f, 2f, 1f}, 2, 2);
    near(invalid.values[0], 0f, "NaN confidence sanitized");
    near(invalid.values[1], 0f, "negative confidence sanitized");
    near(invalid.values[2], 1f, "high confidence clamped");
  }
  private static void foregroundPreservation() {
    EffectMath.Mask allPerson = new EffectMath.Mask(new float[]{1,1,1,1}, 2, 2);
    Frame in = new Frame(8, 6), out = new Frame(8, 6);
    for (int i = 0; i < in.y.capacity(); i++) in.y.put(i, (byte) ((i * 13) % 256));
    for (int i = 0; i < in.u.capacity(); i++) { in.u.put(i, (byte) (i * 23)); in.v.put(i, (byte) (255 - i * 17)); }
    render(in, out, 0, null, allPerson, new EffectMath.Skyline(.5f,.5f,1));
    check(Arrays.equals(in.y.array(), out.y.array()), "foreground luma untouched including full range");
    check(Arrays.equals(in.u.array(), out.u.array()), "foreground U untouched");
    check(Arrays.equals(in.v.array(), out.v.array()), "foreground V untouched");
  }
  private static void rotatedBackground() {
    Frame in = new Frame(8, 8), out = new Frame(8, 8);
    Arrays.fill(in.y.array(), (byte) 200);
    EffectMath.Mask rightPerson = new EffectMath.Mask(new float[]{0,1,0,1}, 2, 2);
    EffectMath.Skyline skyline = new EffectMath.Skyline(.75f,.5f,1);
    render(in, out, 90, null, rightPerson, skyline);
    check((out.y.get(0) & 255) == 200, "90 degree mask right side maps to raw top");
    check((out.y.get(7 * 8) & 255) != 200, "90 degree background maps to raw bottom");
    render(in, out, 270, null, rightPerson, skyline);
    check((out.y.get(7 * 8) & 255) == 200, "270 degree mask right side maps to raw bottom");
    check((out.y.get(0) & 255) != 200, "270 degree background maps to raw top");
  }
  private static void faceLighting() {
    Frame dark = new Frame(64,64), lit = new Frame(64,64), bright = new Frame(64,64), balanced = new Frame(64,64);
    Arrays.fill(dark.y.array(), (byte) 60); Arrays.fill(bright.y.array(), (byte) 180);
    EffectMath.FaceRegion left = new EffectMath.FaceRegion(.1f,.2f,.3f,.4f);
    render(dark,lit,0,left,null,null); render(bright,balanced,0,left,null,null);
    int center = 25 * 64 + 16, far = 25 * 64 + 55;
    check((lit.y.get(center) & 255) > 60, "dark face receives key light");
    check((lit.y.get(far) & 255) == 60, "far background unaffected by face lighting");
    check((lit.y.get(center) & 255) - 60 > (balanced.y.get(center) & 255) - 180, "lighting adapts to measured luma");
    EffectMath.FaceRegion right = new EffectMath.FaceRegion(.6f,.2f,.3f,.4f);
    render(dark,lit,0,right,null,null);
    check((lit.y.get(center) & 255) == 60, "lighting follows face away from old position");
    check((lit.y.get(25 * 64 + 48) & 255) > 60, "lighting reaches new face position");
  }
  private static void skylineParallax() {
    EffectMath.Skyline left = new EffectMath.Skyline(.1f,.5f,1), right = new EffectMath.Skyline(.9f,.5f,1);
    int differences = 0;
    for (int y = 0; y < 256; y += 2) for (int x = 0; x < 256; x += 2) {
      if (left.sample(x / 256f,y / 256f) != right.sample(x / 256f,y / 256f)) differences++;
    }
    check(differences > 100, "skyline layers follow subject centroid at different depths");
    check(EffectMath.rgbToYuv(0xffffff) == ((235 << 16) | (128 << 8) | 128), "RGB white converts to BT.601 limited YUV");
    check(EffectMath.rgbToYuv(0) == ((16 << 16) | (128 << 8) | 128), "RGB black converts to BT.601 limited YUV");
  }
  private static void boldEffects() {
    int size = 64;
    float[] values = new float[size * size];
    for (int y = 12; y < 55; y++) for (int x = 24; x < 40; x++) values[y * size + x] = 1f;
    EffectMath.Mask person = new EffectMath.Mask(values, size, size);
    Frame source = new Frame(size,size), aura = new Frame(size,size), neon = new Frame(size,size);
    Frame spot = new Frame(size,size), moved = new Frame(size,size), weak = new Frame(size,size);
    Arrays.fill(source.y.array(), (byte) 90);
    renderBold(source,aura,person,"crimson-aura",1f,0L);
    renderBold(source,neon,person,"neon-edge",1f,0L);
    renderBold(source,spot,person,"spotlight",1f,0L);
    int subjectY = 30 * size + 30, subjectUv = 15 * (size / 2) + 15;
    for (Frame output : new Frame[]{aura,neon,spot}) {
      check((output.y.get(subjectY) & 255) == 90, "bold effect preserves clear subject luma");
      check((output.u.get(subjectUv) & 255) == 128 && (output.v.get(subjectUv) & 255) == 128,
          "bold effect preserves face/subject chroma");
    }
    int outsideUv = 15 * (size / 2) + 11;
    check((aura.v.get(outsideUv) & 255) > 145, "crimson halo visibly reddens outside silhouette");
    check(!Arrays.equals(aura.y.array(),neon.y.array()) && !Arrays.equals(aura.v.array(),neon.v.array()),
        "neon and crimson produce distinct outgoing pixels");
    check((aura.y.get(0) & 255) == 90 && (neon.y.get(0) & 255) == 90, "contours leave distant background unchanged");
    check((spot.y.get(0) & 255) < 50, "spotlight noticeably dims background");
    renderBold(source,moved,person,"spotlight",1f,3_000_000_000L);
    check(!Arrays.equals(spot.y.array(),moved.y.array()), "spotlight moves over a slow twelve-second orbit");
    renderBold(source,moved,person,"spotlight",1f,12_000_000_000L);
    check(Arrays.equals(spot.y.array(),moved.y.array()), "spotlight loop is deterministic and continuous");
    for (String effect : new String[]{"crimson-aura","neon-edge","spotlight"}) {
      renderBold(source,weak,person,effect,.25f,0L);
      renderBold(source,moved,person,effect,1f,0L);
      check(!Arrays.equals(source.y.array(),weak.y.array()), effect + " visible at 25 percent");
      check(!Arrays.equals(weak.y.array(),moved.y.array()), effect + " intensity visibly changes output");
    }
  }
  private static void skylineIntensity() {
    Frame source = new Frame(8,8), zero = new Frame(8,8), quarter = new Frame(8,8), full = new Frame(8,8);
    Arrays.fill(source.y.array(), (byte) 100);
    EffectMath.Mask person = new EffectMath.Mask(new float[]{0,1,0,1},2,2);
    EffectMath.Skyline skyline = new EffectMath.Skyline(.5f,.5f,1f);
    Frame[] outputs = {zero,quarter,full}; float[] intensities = {0f,.25f,1f};
    for (int i = 0; i < outputs.length; i++) {
      Frame out = outputs[i];
      EffectMath.composite(8,8,0,intensities[i],source.y,8,source.u,4,source.v,4,
          out.y,8,out.u,4,out.v,4,null,person,skyline,"chicago-skyline",0L);
      check((out.y.get(7) & 255) == 100, "skyline intensity preserves fully foreground subject");
      check((out.u.get(3) & 255) == 128 && (out.v.get(3) & 255) == 128, "skyline intensity preserves foreground chroma");
    }
    check(Arrays.equals(source.y.array(),zero.y.array()) && Arrays.equals(source.u.array(),zero.u.array())
        && Arrays.equals(source.v.array(),zero.v.array()), "zero skyline intensity preserves all original pixels");
    check(!Arrays.equals(quarter.y.array(),full.y.array()), "centered skyline differs at 25 and 100 percent");
    check(Math.abs((quarter.y.get(0) & 255) - 100) < Math.abs((full.y.get(0) & 255) - 100),
        "quarter skyline uses less replacement opacity");
    check(!Arrays.equals(quarter.u.array(),full.u.array()) && !Arrays.equals(quarter.v.array(),full.v.array()),
        "skyline intensity applies to both chroma planes");
    near(EffectMath.smoothCentroid(.2f,.8f),.35f,"centroid motion is damped");
    near(EffectMath.smoothCentroid(.5f,.5f),.5f,"stationary centroid stays stable");
  }
  private static void renderBold(Frame in, Frame out, EffectMath.Mask mask, String effect, float intensity, long timeNs) {
    EffectMath.composite(in.width,in.height,0,intensity,
        in.y,in.width,in.u,in.width/2,in.v,in.width/2,
        out.y,out.width,out.u,out.width/2,out.v,out.width/2,null,mask,null,effect,timeNs);
  }
  private static final class Frame {
    final int width, height; final ByteBuffer y,u,v;
    Frame(int width, int height) {
      this.width=width; this.height=height;
      y=ByteBuffer.allocate(width*height); u=ByteBuffer.allocate(width*height/4); v=ByteBuffer.allocate(width*height/4);
      Arrays.fill(u.array(), (byte)128); Arrays.fill(v.array(), (byte)128);
    }
  }
  private static void render(Frame in, Frame out, int rotation, EffectMath.FaceRegion face,
      EffectMath.Mask mask, EffectMath.Skyline skyline) {
    EffectMath.composite(in.width,in.height,rotation,1f,
        in.y,in.width,in.u,in.width/2,in.v,in.width/2,
        out.y,out.width,out.u,out.width/2,out.v,out.width/2,face,mask,skyline);
  }
}
