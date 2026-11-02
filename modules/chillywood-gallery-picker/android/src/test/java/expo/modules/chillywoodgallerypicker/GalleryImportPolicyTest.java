package expo.modules.chillywoodgallerypicker;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

public final class GalleryImportPolicyTest {
  private static int assertions;
  private static void check(boolean value) {
    assertions++;
    if (!value) throw new AssertionError("Gallery import boundary failed at assertion " + assertions);
  }
  private interface Operation { void run() throws Exception; }
  private static void rejects(String reason, Operation operation) throws Exception {
    try { operation.run(); throw new AssertionError("Expected " + reason); }
    catch (IOException error) { check(reason.equals(error.getMessage())); }
  }
  public static void main(String[] args) throws Exception {
    check(GalleryImportPolicy.supportsKind("image"));
    check(GalleryImportPolicy.supportsKind("video"));
    check(!GalleryImportPolicy.supportsKind("audio"));
    check(!GalleryImportPolicy.acceptsMime("image", "video/mp4"));
    check(!GalleryImportPolicy.acceptsMime("video", "image/png"));
    check(!GalleryImportPolicy.acceptsMime("image", null));
    check(!GalleryImportPolicy.acceptsMime("image", "image/"));
    check(GalleryImportPolicy.acceptsMime("image", "image/heic"));
    check(GalleryImportPolicy.acceptsMime("video", "video/quicktime"));
    byte[] bytes = { 1, 2, 3, 4 };
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    check(GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, 4, () -> true) == 4);
    check(Arrays.equals(bytes, output.toByteArray()));
    output.reset();
    rejects("GALLERY_TOO_LARGE", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, 3, () -> true));
    check(output.size() == 0);
    rejects("GALLERY_INVALID_LIMIT", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, 0, () -> true));
    rejects("GALLERY_INVALID_LIMIT", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, GalleryImportPolicy.MAXIMUM_BYTES + 1, () -> true));
    rejects("GALLERY_EMPTY", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(new byte[0]), output, 4, () -> true));
    rejects("GALLERY_RETIRED", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, 4, () -> false));
    AtomicInteger checkpoints = new AtomicInteger();
    rejects("GALLERY_RETIRED", () -> GalleryImportPolicy.copy(new ByteArrayInputStream(bytes), output, 4, () -> checkpoints.incrementAndGet() < 2));
    InputStream stalled = new InputStream() { @Override public int read() { return 0; } @Override public int read(byte[] b) { return 0; } };
    rejects("GALLERY_UNREADABLE", () -> GalleryImportPolicy.copy(stalled, output, 4, () -> true));
    check(GalleryImportPolicy.remainingCacheBytes(0, 0) == GalleryImportPolicy.CACHE_BUDGET_BYTES);
    check(GalleryImportPolicy.remainingCacheBytes(GalleryImportPolicy.CACHE_BUDGET_BYTES - 1, 63) == 1);
    rejects("GALLERY_CACHE_FULL", () -> GalleryImportPolicy.remainingCacheBytes(GalleryImportPolicy.CACHE_BUDGET_BYTES, 1));
    rejects("GALLERY_CACHE_FULL", () -> GalleryImportPolicy.remainingCacheBytes(0, 64));
    rejects("GALLERY_CACHE_FULL", () -> GalleryImportPolicy.remainingCacheBytes(-1, 0));
    check("image/png".equals(GalleryImportPolicy.inferMimeFromName("image.PNG")));
    check(GalleryImportPolicy.inferMimeFromName("unknown") == null);
    check(GalleryImportPolicy.maximumImportBytes(10, 250, "image/png") == 10);
    check(GalleryImportPolicy.maximumImportBytes(10, 250, "image/heic") == 250);
    check(GalleryImportPolicy.maximumImportBytes(20, 0, "image/heif") == 20);
    check(GalleryImportPolicy.maximumImportBytes(GalleryImportPolicy.MAXIMUM_BYTES, 250, "video/mp4") == GalleryImportPolicy.MAXIMUM_BYTES);
    System.out.println("Gallery import production policy: " + assertions + " JVM assertions passed");
  }
}
