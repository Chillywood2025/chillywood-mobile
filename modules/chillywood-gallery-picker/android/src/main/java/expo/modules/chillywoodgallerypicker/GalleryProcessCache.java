package expo.modules.chillywoodgallerypicker;

import java.io.File;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Gallery drafts are memory-only; process death ends their usable ownership.
 * Module/Activity recreation does not: both directory and IDs are process-static.
 */
public final class GalleryProcessCache {
  private static final String PROCESS_ID = "process-" + UUID.randomUUID();
  private static final Set<String> initializedRoots = new HashSet<>();
  public static final ConcurrentHashMap<String, File> selections = new ConcurrentHashMap<>();
  private GalleryProcessCache() { }

  public static synchronized File directory(File appCache) throws IOException {
    File root = new File(appCache, "gallery-imports");
    if (!root.isDirectory() && !root.mkdirs()) throw new IOException("GALLERY_CACHE_UNAVAILABLE");
    String identity = root.getCanonicalPath();
    if (!initializedRoots.contains(identity)) {
      File[] entries = root.listFiles();
      if (entries == null) throw new IOException("GALLERY_CACHE_UNAVAILABLE");
      for (File entry : entries) {
        if (entry.getName().matches("process-[0-9a-fA-F-]{36}") && !PROCESS_ID.equals(entry.getName())) {
          // Only prior-process directories in this module-owned private cache.
          // The process-static ID never changes on module/Activity recreation.
          deleteOwnedTree(entry);
        }
      }
      initializedRoots.add(identity);
    }
    File directory = new File(root, PROCESS_ID);
    if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("GALLERY_CACHE_UNAVAILABLE");
    selections.entrySet().removeIf(entry -> !entry.getValue().exists());
    return directory;
  }

  private static void deleteOwnedTree(File file) throws IOException {
    if (file.isDirectory()) {
      File[] children = file.listFiles();
      if (children == null) throw new IOException("GALLERY_CACHE_UNAVAILABLE");
      for (File child : children) deleteOwnedTree(child);
    }
    if (!file.delete() && file.exists()) throw new IOException("GALLERY_CACHE_UNAVAILABLE");
  }
}
