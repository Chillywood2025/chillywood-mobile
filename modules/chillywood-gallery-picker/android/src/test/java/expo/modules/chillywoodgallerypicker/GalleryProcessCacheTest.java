package expo.modules.chillywoodgallerypicker;

import java.io.File;
import java.nio.file.Files;

public final class GalleryProcessCacheTest {
  private static int assertions;
  private static void check(boolean value) { assertions++; if (!value) throw new AssertionError("Gallery cache assertion " + assertions); }
  public static void main(String[] args) throws Exception {
    File root = new File(args[0]);
    if ("first".equals(args[1])) {
      File old = new File(root, "gallery-imports/process-00000000-0000-0000-0000-000000000001");
      check(old.mkdirs()); Files.write(new File(old, "orphan.partial").toPath(), new byte[] {1, 2});
      File current = GalleryProcessCache.directory(root);
      check(!old.exists()); check(current.isDirectory());
      File active = new File(current, "accepted.jpg"); Files.write(active.toPath(), new byte[] {1, 2, 3});
      GalleryProcessCache.selections.put("opaque", active);
      // Repeated module/Activity instances in this process retain both file and ID.
      check(current.equals(GalleryProcessCache.directory(root))); check(active.exists());
      check(GalleryProcessCache.selections.get("opaque").equals(active));
      Files.writeString(new File(root, "old-process-path").toPath(), current.getAbsolutePath());
      System.out.println("Gallery cache first process: " + assertions + " JVM assertions passed");
    } else {
      File previous = new File(Files.readString(new File(root, "old-process-path").toPath()));
      check(previous.exists());
      File current = GalleryProcessCache.directory(root);
      check(!previous.exists()); check(!current.equals(previous)); check(current.isDirectory());
      check(GalleryProcessCache.selections.isEmpty());
      System.out.println("Gallery cache fresh process: " + assertions + " JVM assertions passed");
    }
  }
}
