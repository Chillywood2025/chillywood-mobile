import java.util.HashMap;
import java.util.Map;

// Native bridge/JNI edges are controlled; the entire SDK method inserted at
// the marker is compiled unchanged. This is not a camera or RTP simulator.
public class SenderContract {
  @interface ReactMethod {}
  static final String TAG = "sender-contract";
  static class Log {
    static void d(String tag, String value) {}
    static void w(String tag, String value) {}
  }
  static class ThreadUtils { static void runOnExecutor(Runnable task) { task.run(); } }
  static class MediaStreamTrack {
    final String id, kind;
    MediaStreamTrack(String id, String kind) { this.id = id; this.kind = kind; }
  }
  static class RtpSender {
    MediaStreamTrack track;
    boolean nativeAccepts = true, nativeThrows = false;
    int writes = 0;
    RtpSender(MediaStreamTrack track) { this.track = track; }
    boolean setTrack(MediaStreamTrack next, boolean ownership) {
      writes++;
      if (nativeThrows) throw new IllegalStateException("native sender disposed");
      if (!nativeAccepts || (next != null && track != null && !next.kind.equals(track.kind))) return false;
      track = next;
      return true;
    }
  }
  static class PeerConnectionObserver {
    final Map<String, RtpSender> senders = new HashMap<>();
    RtpSender getSender(String id) { return senders.get(id); }
  }
  static class Promise {
    int resolved = 0, rejected = 0;
    void resolve(Object value) { resolved++; }
    void reject(Exception error) { rejected++; }
  }
  final Map<Integer, PeerConnectionObserver> mPeerConnectionObservers = new HashMap<>();
  final Map<String, MediaStreamTrack> localTracks = new HashMap<>();
  MediaStreamTrack getLocalTrack(String id) { return localTracks.get(id); }

  // __ACTUAL_SDK_SENDER_METHOD__

  static int checked = 0, failed = 0;
  static void check(boolean ok, String message) {
    checked++;
    if (!ok) { failed++; System.err.println("NATIVE_SENDER_FALSE_ACK: " + message); }
  }
  static class Fixture {
    final SenderContract module = new SenderContract();
    final PeerConnectionObserver peer = new PeerConnectionObserver();
    final MediaStreamTrack original = new MediaStreamTrack("original", "video");
    final MediaStreamTrack replacement = new MediaStreamTrack("replacement", "video");
    final MediaStreamTrack audio = new MediaStreamTrack("audio", "audio");
    final RtpSender sender = new RtpSender(original), audioSender = new RtpSender(audio);
    Fixture() {
      module.mPeerConnectionObservers.put(42, peer);
      peer.senders.put("video", sender); peer.senders.put("audio", audioSender);
      module.localTracks.put(replacement.id, replacement); module.localTracks.put(audio.id, audio);
    }
    Promise invoke(String track) {
      Promise promise = new Promise();
      module.senderReplaceTrack(42, "video", track, promise);
      return promise;
    }
    void rejects(Promise p, String label) {
      check(p.rejected == 1 && p.resolved == 0, label + " rejects exactly once");
      check(sender.track == original, label + " preserves actual prior sender track");
      check(audioSender.track == audio && audioSender.writes == 0, label + " preserves audio");
    }
  }
  public static void main(String[] args) {
    Fixture refused = new Fixture(); refused.sender.nativeAccepts = false;
    refused.rejects(refused.invoke("replacement"), "native SetTrack false");
    Fixture wrongKind = new Fixture();
    wrongKind.rejects(wrongKind.invoke("audio"), "native kind mismatch");
    Fixture missingTrack = new Fixture();
    missingTrack.rejects(missingTrack.invoke("missing"), "nonnull missing track");
    check(missingTrack.sender.writes == 0, "missing track never clears active native sender");
    Fixture thrown = new Fixture(); thrown.sender.nativeThrows = true;
    thrown.rejects(thrown.invoke("replacement"), "native exception");
    Fixture missingPeer = new Fixture(); missingPeer.module.mPeerConnectionObservers.clear();
    missingPeer.rejects(missingPeer.invoke("replacement"), "missing peer");
    Fixture missingSender = new Fixture(); missingSender.peer.senders.remove("video");
    missingSender.rejects(missingSender.invoke("replacement"), "missing sender");
    Fixture success = new Fixture(); Promise accepted = success.invoke("replacement");
    check(accepted.resolved == 1 && accepted.rejected == 0, "successful replacement resolves once");
    check(success.sender.track == success.replacement, "successful replacement installs actual video");
    check(success.audioSender.track == success.audio && success.audioSender.writes == 0, "video swap preserves audio");
    Fixture clear = new Fixture(); Promise cleared = clear.invoke(null);
    check(cleared.resolved == 1 && cleared.rejected == 0 && clear.sender.track == null, "explicit null clears the sender");
    Fixture clearRejected = new Fixture(); clearRejected.sender.nativeAccepts = false;
    clearRejected.rejects(clearRejected.invoke(null), "native rejected null clear");
    System.out.println("Android SDK sender method: " + checked + " assertions, " + failed + " failures");
    if (failed > 0) System.exit(1);
  }
}
