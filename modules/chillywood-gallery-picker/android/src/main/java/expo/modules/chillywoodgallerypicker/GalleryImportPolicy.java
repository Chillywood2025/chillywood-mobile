package expo.modules.chillywoodgallerypicker;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.function.BooleanSupplier;

/** Pure byte-import boundary used by the actual native module and JVM tests. */
public final class GalleryImportPolicy {
  private GalleryImportPolicy() {}
  public static final long MAXIMUM_BYTES = 5L * 1024 * 1024 * 1024;
  public static final long CACHE_BUDGET_BYTES = 6L * 1024 * 1024 * 1024;
  public static final int CACHE_BUDGET_FILES = 64;
  public static final long MAXIMUM_HEIC_IMPORT_BYTES = 250L * 1024 * 1024;

  public static long maximumImportBytes(long requested, long heicMaximum, String mime) {
    boolean heic = "image/heic".equals(mime) || "image/heif".equals(mime)
      || "image/heic-sequence".equals(mime) || "image/heif-sequence".equals(mime);
    return heic ? Math.max(requested, heicMaximum) : requested;
  }

  /** Never evict an accepted file which a draft/upload may still be using. */
  public static long remainingCacheBytes(long existingBytes, int existingFiles) throws IOException {
    if (existingBytes < 0 || existingFiles < 0 || existingFiles >= CACHE_BUDGET_FILES || existingBytes >= CACHE_BUDGET_BYTES) {
      throw new IOException("GALLERY_CACHE_FULL");
    }
    return CACHE_BUDGET_BYTES - existingBytes;
  }

  public static boolean supportsKind(String kind) {
    return "image".equals(kind) || "video".equals(kind);
  }

  public static boolean acceptsMime(String kind, String mime) {
    return supportsKind(kind) && mime != null && mime.startsWith(kind + "/") && mime.length() > kind.length() + 1;
  }

  public static String inferMimeFromName(String name) {
    if (name == null) return null;
    String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT);
    switch (extension) {
      case "jpg": case "jpeg": return "image/jpeg";
      case "png": return "image/png";
      case "webp": return "image/webp";
      case "gif": return "image/gif";
      case "heic": return "image/heic";
      case "heif": return "image/heif";
      case "mp4": case "m4v": return "video/mp4";
      case "mov": return "video/quicktime";
      case "webm": return "video/webm";
      default: return null;
    }
  }

  public static long copy(InputStream input, OutputStream output, long maximumBytes, BooleanSupplier current) throws IOException {
    if (maximumBytes < 1 || maximumBytes > MAXIMUM_BYTES) throw new IOException("GALLERY_INVALID_LIMIT");
    byte[] buffer = new byte[64 * 1024];
    long copied = 0;
    int emptyReads = 0;
    while (true) {
      if (!current.getAsBoolean()) throw new IOException("GALLERY_RETIRED");
      int count = input.read(buffer);
      if (count < 0) break;
      if (count == 0) {
        if (++emptyReads > 16) throw new IOException("GALLERY_UNREADABLE");
        continue;
      }
      emptyReads = 0;
      if (!current.getAsBoolean()) throw new IOException("GALLERY_RETIRED");
      if (count > maximumBytes - copied) throw new IOException("GALLERY_TOO_LARGE");
      output.write(buffer, 0, count);
      copied += count;
    }
    if (!current.getAsBoolean()) throw new IOException("GALLERY_RETIRED");
    if (copied == 0) throw new IOException("GALLERY_EMPTY");
    return copied;
  }
}
