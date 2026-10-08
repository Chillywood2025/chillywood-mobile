import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import org.webrtc.*;

// The complete three production SDK bridge methods are inserted unchanged.
// MediaStream and MediaStreamTrack are the pinned upstream Java wrappers;
// only their JNI entry points and React's executor are controlled here.
public class ReleaseContract {
  @interface ReactMethod {}
  static final String TAG = "release-contract";
  static class Log { static void d(String tag, String message) {} }
  static class ThreadUtils {
    static final ArrayDeque<Runnable> queue = new ArrayDeque<>();
    static void runOnExecutor(Runnable action) { queue.add(action); }
    static void drain() { while (!queue.isEmpty()) queue.remove().run(); }
  }
  final Map<String, MediaStream> localStreams = new HashMap<>();
  final Map<String, MediaStreamTrack> localTracks = new HashMap<>();
  final Map<String, Integer> captureDisposals = new HashMap<>();
  final GetUserMediaImpl getUserMediaImpl = new GetUserMediaImpl();
  MediaStreamTrack getLocalTrack(String id) { return localTracks.get(id); }
  MediaStreamTrack getTrack(int pcId, String id) { return pcId == -1 ? getLocalTrack(id) : null; }
  class GetUserMediaImpl {
    void disposeTrack(String id) {
      MediaStreamTrack track = localTracks.remove(id);
      if (track != null) {
        captureDisposals.merge(id, 1, Integer::sum);
        track.dispose();
      }
    }
  }

  // __ACTUAL_SDK_RELEASE_METHODS__

  static int checked, failed;
  static void check(boolean ok, String message) {
    checked++;
    if (!ok) { failed++; System.err.println("RELEASE_CONTRACT_FAIL: " + message); }
  }
  static void scenario(String label, Runnable action) {
    try { action.run(); }
    catch (Throwable error) {
      failed++;
      System.err.println("RELEASE_CONTRACT_FAIL: " + label + ": " + error);
    } finally { ThreadUtils.queue.clear(); }
  }
  static class Fixture {
    final ReleaseContract module = new ReleaseContract();
    final MediaStream first = stream("first"), second = stream("second"), unrelated = stream("unrelated");
    final MediaStreamTrack shared, untouched;
    final String sharedId, untouchedId;
    final long sharedHandle, untouchedHandle;
    Fixture(boolean video) {
      sharedHandle = NativeEdges.allocate(video ? "video" : "audio");
      untouchedHandle = NativeEdges.allocate("audio");
      shared = video ? new VideoTrack(sharedHandle) : new AudioTrack(sharedHandle);
      untouched = new AudioTrack(untouchedHandle);
      sharedId = shared.id(); untouchedId = untouched.id();
      module.localTracks.put(sharedId, shared); module.localTracks.put(untouchedId, untouched);
      add(first, shared); add(second, shared); add(unrelated, untouched);
    }
    MediaStream stream(String id) {
      MediaStream value = new MediaStream(NativeEdges.allocate("stream"));
      module.localStreams.put(id, value);
      return value;
    }
    static void add(MediaStream stream, MediaStreamTrack track) {
      if (track instanceof AudioTrack) stream.addTrack((AudioTrack) track);
      else stream.addTrack((VideoTrack) track);
    }
    // Native calls queued by MediaStream.release(releaseTracks), including the
    // second JS stream's stale track list after the first releases its owner.
    void release(String id, boolean releaseTrack) {
      module.mediaStreamRemoveTrack(id, -1, sharedId);
      if (releaseTrack) module.mediaStreamTrackRelease(sharedId);
      module.mediaStreamRelease(id);
    }
    void complete(String label) {
      ThreadUtils.drain();
      check(module.captureDisposals.getOrDefault(sharedId, 0) == 1, label + " disposes capture exactly once");
      check(NativeEdges.releases(sharedHandle) == 1, label + " releases native track exactly once");
      check(!module.localTracks.containsKey(sharedId), label + " drops disposed track owner");
      check(module.localStreams.size() == 1 && module.localStreams.get("unrelated") == unrelated,
        label + " retires only requested stream containers");
      check(untouched.enabled() && NativeEdges.releases(untouchedHandle) == 0,
        label + " preserves unrelated live capture");
      check(unrelated.audioTracks.contains(untouched), label + " preserves unrelated membership");
    }
  }
  public static void main(String[] args) {
    for (boolean video : new boolean[] { true, false }) {
      for (boolean reverse : new boolean[] { false, true }) {
        String label = (video ? "video" : "audio") + (reverse ? " auxiliary-first" : " local-first");
        scenario(label, () -> {
          Fixture f = new Fixture(video);
          f.release(reverse ? "second" : "first", true);
          f.release(reverse ? "first" : "second", true);
          f.complete(label);
          f.module.mediaStreamTrackRelease(f.sharedId);
          f.module.mediaStreamRelease("first"); f.module.mediaStreamRelease("second");
          ThreadUtils.drain();
          check(NativeEdges.releases(f.sharedHandle) == 1, label + " repeated cleanup stays idempotent");
        });
      }
      scenario((video ? "video" : "audio") + " release(false)", () -> {
        Fixture f = new Fixture(video);
        f.release("first", false); ThreadUtils.drain();
        check(f.shared.enabled() && NativeEdges.releases(f.sharedHandle) == 0,
          "release(false) leaves shared capture alive");
        check(f.second.audioTracks.contains(f.shared) || f.second.videoTracks.contains(f.shared),
          "release(false) preserves other stream membership");
        f.release("second", true); f.complete("release(false) then owner release");
      });
      scenario((video ? "video" : "audio") + " direct track retirement", () -> {
        Fixture f = new Fixture(video);
        MediaStream third = f.stream("third"); Fixture.add(third, f.shared);
        f.module.mediaStreamTrackRelease(f.sharedId);
        f.module.mediaStreamTrackRelease(f.sharedId);
        f.module.mediaStreamRelease("first"); f.module.mediaStreamRelease("second");
        f.module.mediaStreamRelease("third");
        f.complete("direct track retirement");
      });
    }
    System.out.println("Android SDK release methods + upstream Java disposal: " + checked + " assertions, " + failed + " failures");
    if (failed > 0) System.exit(1);
  }
}
