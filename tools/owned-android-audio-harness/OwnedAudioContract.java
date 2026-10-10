package com.livekit.reactnative.audio;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.Handler;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.livekit.reactnative.LiveKitReactNative;
import com.oney.WebRTCModule.WebRTCModule;
import com.oney.WebRTCModule.WebRTCModuleOptions;
import com.twilio.audioswitch.AudioDevice;
import com.twilio.audioswitch.AudioSwitch;
import java.util.List;
import java.util.function.Supplier;
import org.webrtc.audio.ChillywoodAudioTrackRoute;
import org.webrtc.audio.JavaAudioDeviceModule;

/** Executes the production coordinator and generated SDK manager unchanged. */
public final class OwnedAudioContract {
    private static int passed, failed;
    private static String filter;
    private static final class Reply implements Promise {
        int settlements;
        Object value;
        String error;
        @Override public void resolve(Object result) {
            ++settlements; value = result;
            check(settlements == 1, "promise resolved/rejected more than once");
        }
        @Override public void reject(String code, String message) {
            ++settlements; error = code;
            check(settlements == 1, "promise resolved/rejected more than once");
        }
        void pending() { check(settlements == 0, "operation falsely settled: " + error + " / " + value); }
        void success() { check(settlements == 1 && error == null, "expected success, got " + error); }
        void error(String code) { check(settlements == 1 && code.equals(error), "expected " + code + ", got " + error); }
        WritableMap receipt() { success(); return (WritableMap) value; }
    }
    private static class Fixture {
        final AudioDeviceInfo speaker = new AudioDeviceInfo(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
        final AudioDeviceInfo earpiece = new AudioDeviceInfo(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
        final AudioManager system = new AudioManager();
        final AudioSwitchManager manager;
        final ChillywoodOwnedAudioSession owned;
        Fixture() {
            Handler.reset(); AudioSwitch.reset(); Build.VERSION.SDK_INT = 35;
            system.available.add(speaker); system.available.add(earpiece); system.selected = earpiece;
            manager = new AudioSwitchManager(new Context(system)); owned = manager.ownedSession;
        }
        Reply acquire(String owner) { return acquire(owner, "earpiece"); }
        Reply acquire(String owner, String output) {
            Reply reply = new Reply(); owned.acquire(owner, output, reply); return reply;
        }
        void acquireReady(String owner) {
            Reply reply = acquire(owner); reply.pending(); Handler.drain();
            check(owner.equals(reply.receipt().getString("owner")), "wrong receipt owner");
        }
        Reply release(String owner) { Reply reply = new Reply(); owned.release(owner, reply); return reply; }
        Reply select(String owner, String output) { Reply reply = new Reply(); owned.select(owner, output, reply); return reply; }
        Reply read(String owner) { Reply reply = new Reply(); owned.read(owner, reply); return reply; }
    }
    private static final class LegacyFixture extends Fixture {
        final ReactApplicationContext context = new ReactApplicationContext(system);
        final JavaAudioDeviceModule adm = new JavaAudioDeviceModule();
        final WebRTCModule factory = new WebRTCModule(adm);
        final ChillywoodAudioTrackRoute.Observer observer = new ChillywoodAudioTrackRoute.Observer();
        final ChillywoodAudioTrackRoute probe;
        AudioTrack track;
        LegacyFixture() {
            Build.VERSION.SDK_INT = 30;
            LiveKitReactNative.INSTANCE.setFixtureAdm(adm);
            WebRTCModuleOptions.getInstance().audioDeviceModule = adm;
            context.setNativeModule(WebRTCModule.class, factory);
            observer.bind(adm);
            probe = new ChillywoodAudioTrackRoute(context);
            owned.setLegacyRouteProbe(probe);
        }
        void startTrack(AudioDeviceInfo output) {
            track = new AudioTrack(output); adm.setFixtureTrack(track);
            observer.onWebRtcAudioTrackStart(); Handler.drain();
        }
        void route(AudioDeviceInfo output) { track.routedDevice = output; track.emitRouteChanged(); Handler.advance(50); }
        void noNewMediaOperations() {
            equal(adm.releases, 0, "routing cannot release the shared ADM");
            if (track != null) equal(track.playCalls + track.stopCalls + track.releaseCalls, 0,
                "route observation must not create/start/stop/release playback");
        }
        void noApi31() {
            equal(system.readCalls + system.availableCalls + system.setCalls + system.clearCalls
                + system.addedListeners + system.removedListeners, 0, "API30 cannot call API31 framework methods");
            noNewMediaOperations();
        }
    }
    private static <T> T onMain(Supplier<T> action) {
        Object[] result = {null};
        new Handler(android.os.Looper.getMainLooper()).post(() -> result[0] = action.get());
        Handler.drain();
        @SuppressWarnings("unchecked") T value = (T) result[0];
        return value;
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    private static void equal(Object actual, Object expected, String message) {
        check(java.util.Objects.equals(actual, expected), message + ": " + actual + " != " + expected);
    }
    private static void test(String name, Runnable action) {
        if (filter != null && !name.equals(filter)) return;
        try { action.run(); ++passed; System.out.println("PASS " + name); }
        catch (Throwable error) { ++failed; System.err.println("FAIL " + name + ": " + error); error.printStackTrace(System.err); }
    }
    public static void main(String[] args) {
        filter = args.length == 0 ? null : args[0];
        if ("api30_reflection_shape_fails_closed".equals(filter)) test("api30_reflection_shape_fails_closed", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece);
            check(!f.probe.isAvailable(), "unreviewed private track field shape cannot enable the probe");
            equal(onMain(() -> f.probe.currentTrack()), null, "unreviewed shape cannot expose a track");
            Reply acquire = f.acquire("A"); Handler.drain();
            equal(acquire.receipt().getString("selected"), "none", "unavailable observer must not block startup or infer receiver");
            Reply select = f.select("A", "speaker"); Handler.advance(3000);
            check(select.error != null, "unavailable observer cannot confirm selection");
            equal(f.system.speakerCalls, 0, "unavailable observer cannot actuate a manual route"); f.noApi31();
        });
        test("prequeue_owner_replacement", () -> {
            Fixture f = new Fixture();
            Reply a = f.acquire("A"), release = f.release("A"), b = f.acquire("B");
            equal(AudioSwitch.constructed, 0, "no native work before main queue");
            Handler.drain(); a.error("E_AUDIO_STALE"); release.success(); b.success();
            equal(AudioSwitch.starts, 1, "only successor starts"); equal(AudioSwitch.stops, 0, "old release cannot stop successor");
            equal(f.system.clearCalls, 0, "old release cannot clear successor route");
            equal(Handler.globalRemovals, 0, "must not clear handler callbacks globally");
        });
        test("stale_release_after_successor", () -> {
            Fixture f = new Fixture(); f.acquireReady("A");
            Reply release = f.release("A"), b = f.acquire("B"); Handler.drain(); release.success(); b.success();
            int stops = AudioSwitch.stops, clears = f.system.clearCalls;
            f.release("A").success(); Handler.advance(3000);
            equal(AudioSwitch.stops, stops, "stale stop affected successor"); equal(f.system.clearCalls, clears, "stale clear affected successor");
            Reply read = f.read("B"); Handler.drain(); read.success();
        });
        test("queued_old_release_after_successor_activation", () -> {
            Fixture f = new Fixture(); f.acquireReady("A");
            Reply firstRelease = f.release("A"), b = f.acquire("B"), lateOldRelease = f.release("A");
            Handler.drain(); firstRelease.success(); b.success(); lateOldRelease.success();
            equal(AudioSwitch.stops, 1, "queued old release must not stop now-active successor");
            equal(f.system.clearCalls, 1, "queued old release must not clear successor output");
            equal(f.system.selected, f.earpiece, "successor selected output remains active");
            Reply read = f.read("B"); Handler.drain(); read.success();
        });
        test("pending_selection_cannot_mutate_successor", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            Reply released = f.release("A"), b = f.acquire("B"); select.error("E_AUDIO_STALE");
            Handler.drain(); released.success(); b.success();
            int sets = f.system.setCalls, stops = AudioSwitch.stops, clears = f.system.clearCalls;
            Handler.advance(5000); select.error("E_AUDIO_STALE");
            equal(f.system.setCalls, sets, "old callback selected route"); equal(AudioSwitch.stops, stops, "old timeout stopped B");
            equal(f.system.clearCalls, clears, "old timeout cleared B");
            equal(f.system.selected, f.earpiece, "successor output changed");
        });
        test("raw_queued_commands_fenced", () -> {
            Fixture f = new Fixture(); int[] config = {0};
            f.manager.start(); f.manager.stop(); f.manager.selectAudioOutput(AudioDeviceKind.SPEAKER);
            f.manager.enableSpeakerphone(true); f.owned.runUnowned(() -> ++config[0]);
            Reply a = f.acquire("A"); Handler.drain(); a.success();
            equal(AudioSwitch.starts, 1, "old raw start executed"); equal(AudioSwitch.stops, 0, "old raw stop executed");
            equal(AudioSwitch.selections, 0, "old raw select executed"); equal(f.system.speakerCalls, 0, "old speaker command executed");
            equal(config[0], 0, "old configuration executed");
            f.manager.stop(); f.manager.selectAudioOutput(AudioDeviceKind.SPEAKER); f.owned.runUnowned(() -> ++config[0]);
            Handler.drain(); equal(AudioSwitch.stops, 0, "raw stop intruded into owner"); equal(config[0], 0, "configuration intruded");
        });
        test("latest_queued_selection_only", () -> {
            Fixture f = new Fixture(); f.acquireReady("A");
            Reply first = f.select("A", "speaker"), latest = f.select("A", "earpiece");
            Handler.drain(); first.error("E_AUDIO_STALE");
            equal(latest.receipt().getString("selected"), "earpiece", "latest receipt output");
            equal(f.system.requests, List.of(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE), "stale selection reached OS");
        });
        test("latest_pending_selection_only", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply first = f.select("A", "speaker"); Handler.drain(); first.pending();
            f.system.applySetter = true; Reply latest = f.select("A", "earpiece");
            first.error("E_AUDIO_STALE"); Handler.drain(); latest.success(); Handler.advance(3000);
            first.error("E_AUDIO_STALE"); latest.success(); equal(f.system.selected, f.earpiece, "stale select overwrote latest");
        });
        test("accepted_setter_requires_os_confirmation", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            Handler.advance(2499); select.pending(); Handler.advance(1); select.error("E_AUDIO_TIMEOUT");
            equal(f.system.setCalls, 1, "accepted setter should not be repeatedly issued");
            equal(f.system.selected, f.earpiece, "controlled OS must remain opposite"); Handler.advance(3000); select.error("E_AUDIO_TIMEOUT");
        });
        test("scanner_initially_empty_waits", () -> {
            Fixture f = new Fixture(); AudioSwitch.scanner.clear();
            Reply acquire = f.acquire("A"); Handler.drain(); acquire.pending(); Handler.advance(250); acquire.pending();
            AudioSwitch.scanner.add(new AudioDevice.Earpiece()); AudioSwitch.instances.get(0).cached = AudioSwitch.scanner.get(0);
            Handler.advance(50); acquire.success();
        });
        test("selection_waits_for_scanner", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.scanner.clear();
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            equal(f.system.setCalls, 0, "must not select before AudioSwitch discovers target");
            AudioSwitch.scanner.add(new AudioDevice.Speakerphone()); Handler.advance(50);
            equal(select.receipt().getString("selected"), "speaker", "delayed scanner selection failed");
        });
        test("cached_route_does_not_replace_os_setter", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.instances.get(0).cached = new AudioDevice.Speakerphone();
            equal(f.system.selected, f.earpiece, "OS deliberately disagrees with cache");
            Reply select = f.select("A", "speaker"); Handler.drain();
            equal(select.receipt().getString("selected"), "speaker", "OS selected output receipt");
            equal(f.system.setCalls, 1, "matching cache still requires framework request"); equal(f.system.selected, f.speaker, "OS repaired");
        });
        test("startup_default_repairs_opposite_os_route", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker;
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain();
            equal(acquire.receipt().getString("selected"), "earpiece", "startup fallback requires real selected route");
            equal(f.system.requests, List.of(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE), "startup explicitly repairs OS route once");
            equal(AudioSwitch.selections, 0, "default preference must not become AudioSwitch userSelected override");
            Handler.advance(3000); equal(f.system.setCalls, 1, "startup fallback remains one request");
        });
        test("startup_setter_accepted_without_route_times_out", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker; f.system.applySetter = false;
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.pending();
            equal(f.system.setCalls, 1, "startup attempted repair once"); Handler.advance(2499); acquire.pending();
            equal(f.system.selected, f.speaker, "accepted setter is deliberately not OS proof");
            Handler.advance(1); acquire.error("E_AUDIO_TIMEOUT"); equal(f.system.setCalls, 1, "startup timeout must not loop setter");
            equal(AudioSwitch.stops, 1, "failed startup releases switch"); equal(f.system.clearCalls, 1, "failed startup clears automatic request");
        });
        test("startup_setter_refusal_rejects", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker; f.system.setterAccepted = false;
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.error("E_AUDIO_SELECT");
            equal(f.system.setCalls, 1, "one rejected request"); equal(AudioSwitch.stops, 1, "rejected startup cleans partial session");
            f.system.setterAccepted = true; AudioSwitch.routeOnActivate = true; f.acquireReady("B");
        });
        test("startup_never_forces_builtin_with_external_candidate", () -> {
            for (boolean[] scenario : new boolean[][] { {false, true}, {true, true}, {true, false} }) {
                Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false;
                AudioDeviceInfo bluetooth = new AudioDeviceInfo(AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
                if (scenario[1]) f.system.available.add(bluetooth);
                f.system.selected = scenario[0] ? bluetooth : f.speaker;
                Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.pending(); Handler.advance(2499); acquire.pending();
                equal(f.system.setCalls, 0, "external candidate or selected route prevents builtin force");
                equal(AudioSwitch.selections, 0, "startup must not force scanner choice over external policy");
                Handler.advance(1); acquire.error("E_AUDIO_TIMEOUT");
            }
        });
        test("startup_waits_for_preferred_scanner_default", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker;
            AudioSwitch.scanner.removeIf(device -> device instanceof AudioDevice.Earpiece);
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.pending(); Handler.advance(250); acquire.pending();
            equal(f.system.setCalls, 0, "temporary scanner fallback cannot force or acknowledge wrong default");
            AudioDevice earpiece = new AudioDevice.Earpiece(); AudioSwitch.scanner.add(earpiece);
            AudioSwitch.instances.get(0).cached = earpiece; AudioSwitch.instances.get(0).queueScannerChange(); Handler.advance(50);
            equal(acquire.receipt().getString("selected"), "earpiece", "late preferred discovery confirms actual desired route");
            equal(f.system.setCalls, 1, "repair occurs after preferred scanner discovery"); equal(AudioSwitch.selections, 0, "default remains preference");
        });
        test("accessory_change_clears_only_automatic_startup_request", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker;
            java.util.ArrayList<Integer> clearCountsAtEvent = new java.util.ArrayList<>();
            f.owned.setRouteListener(receipt -> clearCountsAtEvent.add(f.system.clearCalls));
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.success(); clearCountsAtEvent.clear();
            equal(f.system.clearCalls, 0, "automatic request retained while scanner default unchanged");
            AudioDevice wired = new AudioDevice.WiredHeadset(); AudioSwitch.scanner.add(wired);
            f.system.available.add(new AudioDeviceInfo(AudioDeviceInfo.TYPE_WIRED_HEADSET));
            AudioSwitch.instances.get(0).cached = wired; AudioSwitch.instances.get(0).queueScannerChange(); Handler.drain();
            equal(f.system.clearCalls, 1, "accessory scanner preference releases automatic explicit route");
            equal(clearCountsAtEvent, List.of(1), "automatic override cleared before emitting current receipt");
            AudioSwitch.instances.get(0).queueScannerChange(); Handler.drain(); equal(f.system.clearCalls, 1, "automatic marker cleared only once");
        });
        test("accessory_change_preserves_manual_route", () -> {
            Fixture f = new Fixture(); AudioSwitch.routeOnActivate = false; f.system.selected = f.speaker;
            Reply acquire = f.acquire("A", "earpiece"); Handler.drain(); acquire.success();
            Reply manual = f.select("A", "speaker"); Handler.drain(); manual.success();
            int clears = f.system.clearCalls;
            AudioDevice wired = new AudioDevice.WiredHeadset(); AudioSwitch.scanner.add(wired);
            f.system.available.add(new AudioDeviceInfo(AudioDeviceInfo.TYPE_WIRED_HEADSET));
            AudioSwitch.instances.get(0).cached = wired; AudioSwitch.instances.get(0).queueScannerChange(); Handler.drain();
            equal(f.system.clearCalls, clears, "accessory event cannot clear manually chosen route");
            equal(f.system.selected, f.speaker, "manual explicit route preserved");
        });
        test("removed_device_cannot_confirm", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            f.system.available.remove(f.speaker); f.system.selected = null;
            Handler.advance(2500); check(select.settlements == 1 && select.error != null, "removed device falsely confirmed");
        });
        test("removed_device_with_stale_selected_cannot_confirm", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            f.system.available.remove(f.speaker); f.system.selected = f.speaker;
            Handler.advance(2500); check(select.settlements == 1 && select.error != null, "removed device falsely confirmed from stale selected getter");
        });
        test("unavailable_output_rejected", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.available.remove(f.speaker);
            Reply select = f.select("A", "speaker"); Handler.drain(); select.error("E_AUDIO_UNAVAILABLE");
            equal(f.system.setCalls, 0, "unavailable output was sent to OS");
        });
        test("setter_rejected", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.setterAccepted = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.error("E_AUDIO_SELECT");
        });
        test("empty_availability_acquisition_waits", () -> {
            Fixture f = new Fixture(); f.system.available.clear();
            Reply acquire = f.acquire("A"); Handler.drain(); acquire.pending(); Handler.advance(500); acquire.pending();
            f.system.available.add(f.earpiece); Handler.advance(50); acquire.success();
        });
        test("acquisition_timeout_cleans_up", () -> {
            Fixture f = new Fixture(); f.system.available.clear(); f.system.selected = null;
            Reply acquire = f.acquire("A"); Handler.drain(); Handler.advance(2499); acquire.pending();
            Handler.advance(1); acquire.error("E_AUDIO_TIMEOUT"); equal(AudioSwitch.stops, 1, "timed out acquisition cleanup");
            f.system.available.add(f.earpiece); f.acquireReady("B");
        });
        test("read_waits_and_stale_read_rejects", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.available.clear(); f.system.selected = null;
            Reply read = f.read("A"); Handler.drain(); read.pending();
            f.system.available.add(f.earpiece); f.system.selected = f.earpiece; Handler.advance(50); read.success();
            f.system.selected = null; Reply old = f.read("A"); Handler.drain(); old.pending();
            f.release("A"); Reply b = f.acquire("B"); Handler.drain(); b.success(); Handler.advance(50); old.error("E_AUDIO_STALE");
        });
        test("read_timeout_is_bounded", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.available.clear();
            Reply read = f.read("A"); Handler.drain(); Handler.advance(2500); read.error("E_AUDIO_TIMEOUT");
        });
        test("start_exception_cleans_up", () -> {
            Fixture f = new Fixture(); AudioSwitch.throwStart = true;
            Reply acquire = f.acquire("A"); Handler.drain(); acquire.error("E_AUDIO_START");
            equal(AudioSwitch.stops, 1, "partially created switch cleaned up"); equal(f.system.clearCalls, 1, "partial route cleared");
            AudioSwitch.throwStart = false; f.acquireReady("B");
        });
        test("activation_exception_cleans_up", () -> {
            Fixture f = new Fixture(); AudioSwitch.throwActivate = true;
            Reply acquire = f.acquire("A"); Handler.drain(); acquire.error("E_AUDIO_START");
            equal(AudioSwitch.stops, 1, "partially activated switch cleaned up");
            AudioSwitch.throwActivate = false; f.acquireReady("B");
        });
        test("stop_exception_allows_successor", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.throwStop = true;
            Reply release = f.release("A"); Handler.drain(); release.error("E_AUDIO_STOP");
            equal(f.system.clearCalls, 1, "OS cleanup still attempted after stop throws");
            AudioSwitch.throwStop = false; f.acquireReady("B");
        });
        test("stop_failure_retains_exact_cleanup_owner", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.throwStop = true;
            Reply release = f.release("A"); Handler.drain(); release.error("E_AUDIO_STOP");
            Reply b = f.acquire("B"); Handler.drain(); b.error("E_AUDIO_STOP");
            equal(AudioSwitch.constructed, 1, "successor must not start over failed predecessor cleanup");
            equal(AudioSwitch.stops, 2, "successor must retry retained switch");
            f.manager.start(); Handler.drain(); equal(AudioSwitch.constructed, 1, "unowned start must stay fenced");
            AudioSwitch.throwStop = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(AudioSwitch.stops, 3, "exact old owner retries same retained switch");
            f.acquireReady("C"); int stops = AudioSwitch.stops, clears = f.system.clearCalls;
            f.release("A").success(); Handler.drain(); equal(AudioSwitch.stops, stops, "old cleanup cannot stop successor");
            equal(f.system.clearCalls, clears, "old cleanup cannot clear successor");
        });
        test("queued_release_and_successor_both_report_cleanup_failure", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.throwStop = true;
            Reply release = f.release("A"), b = f.acquire("B"); Handler.drain();
            release.error("E_AUDIO_STOP"); b.error("E_AUDIO_STOP");
            equal(AudioSwitch.constructed, 1, "reserved successor cannot activate after cleanup failure");
            AudioSwitch.throwStop = false; Reply retry = f.release("A"); Handler.drain(); retry.success(); f.acquireReady("C");
        });
        test("clear_failure_retains_cleanup_owner", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.throwOnClear = true;
            Reply release = f.release("A"); Handler.drain(); release.error("E_AUDIO_STOP");
            Reply b = f.acquire("B"); Handler.drain(); b.error("E_AUDIO_STOP");
            equal(AudioSwitch.constructed, 1, "successor cannot start while explicit old route cleanup failed");
            f.system.throwOnClear = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            f.acquireReady("C"); int clears = f.system.clearCalls;
            f.release("A").success(); Handler.drain(); equal(f.system.clearCalls, clears, "old failed clear cannot affect new owner");
        });
        test("failed_acquire_cleanup_can_retry", () -> {
            Fixture f = new Fixture(); AudioSwitch.throwStart = true; AudioSwitch.throwStop = true;
            Reply acquire = f.acquire("A"); Handler.drain(); acquire.error("E_AUDIO_START");
            AudioSwitch.throwStart = false; Reply b = f.acquire("B"); Handler.drain(); b.error("E_AUDIO_STOP");
            equal(AudioSwitch.constructed, 1, "failed partial acquire must retain switch");
            AudioSwitch.throwStop = false; Reply cleanup = f.release("A"); Handler.drain(); cleanup.success(); f.acquireReady("C");
        });
        test("invalidate_cleanup_failure_does_not_escape", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); AudioSwitch.throwStop = true;
            f.owned.invalidate(); Handler.drain(); equal(AudioSwitch.stops, 1, "invalidate attempted cleanup");
            AudioSwitch.throwStop = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(AudioSwitch.stops, 2, "invalidated exact owner can retry retained cleanup");
        });
        test("owned_acquire_replaces_unowned_manager", () -> {
            Fixture f = new Fixture(); f.manager.start(); Handler.drain();
            Reply owned = f.acquire("A", "earpiece"); Handler.drain(); owned.success();
            equal(AudioSwitch.constructed, 2, "owned takeover resets unowned default"); equal(AudioSwitch.stops, 1, "unowned manager stopped first");
            equal(AudioSwitch.instances.get(1).preferencesAtActivation.get(2), AudioDevice.Earpiece.class, "takeover default before activation");
        });
        test("route_events_are_owner_fenced", () -> {
            Fixture f = new Fixture(); java.util.ArrayList<WritableMap> events = new java.util.ArrayList<>();
            f.owned.setRouteListener(events::add); f.acquireReady("A"); events.clear();
            f.system.selected = f.speaker; f.system.emitRouteChanged(); Handler.drain();
            equal(events.size(), 1, "current route event"); equal(events.get(0).getString("selected"), "speaker", "event OS readback");
            f.system.emitRouteChanged(); f.release("A"); Reply b = f.acquire("B"); Handler.drain(); b.success();
            equal(events.stream().filter(event -> "A".equals(event.getString("owner"))).count(), 1L, "queued old event must not emit predecessor receipt");
            events.clear();
            f.system.selected = f.speaker; f.system.emitRouteChanged(); Handler.drain();
            equal(events.size(), 1, "successor route event"); equal(events.get(0).getString("owner"), "B", "successor event owner");
            f.owned.invalidate(); Handler.drain(); f.system.emitRouteChanged(); Handler.drain(); equal(events.size(), 1, "events after invalidation");
            equal(f.system.addedListeners, f.system.removedListeners, "listeners removed exactly");
        });
        test("scanner_only_change_refreshes_available", () -> {
            Fixture f = new Fixture(); java.util.ArrayList<WritableMap> events = new java.util.ArrayList<>();
            int[] originalCallbacks = {0}; f.manager.audioDeviceChangeListener = (devices, selected) -> { ++originalCallbacks[0]; return null; };
            f.owned.setRouteListener(events::add); Reply a = f.acquire("A", "speaker"); Handler.drain();
            equal(a.receipt().getArray("available"), List.of("speaker", "earpiece"), "initial scanner outputs"); events.clear();
            AudioSwitch predecessor = AudioSwitch.instances.get(0); AudioDeviceInfo selected = f.system.selected;
            AudioSwitch.scanner.removeIf(device -> device instanceof AudioDevice.Earpiece); predecessor.queueScannerChange(); Handler.drain();
            equal(f.system.selected, selected, "OS output deliberately unchanged"); equal(events.size(), 1, "scanner-only event must refresh receipt");
            equal(events.get(0).getArray("available"), List.of("speaker"), "removed scanner output no longer advertised");
            equal(events.get(0).getString("owner"), "A", "scanner event bound to owner"); equal(originalCallbacks[0], 2, "original SDK listener retained");
            f.release("A"); Reply b = f.acquire("B", "speaker"); predecessor.queueScannerChange(); Handler.drain(); b.success();
            equal(events.stream().filter(event -> "A".equals(event.getString("owner"))).count(), 1L, "old scanner callback cannot emit predecessor receipt");
            equal(events.stream().filter(event -> "B".equals(event.getString("owner"))).count(), 1L, "old scanner callback cannot relabel itself as successor; only B initial discovery emits");
            events.clear(); AudioSwitch.scanner.add(new AudioDevice.Earpiece()); AudioSwitch.instances.get(1).queueScannerChange(); Handler.drain();
            equal(events.size(), 1, "current scanner event still works after predecessor callback");
            equal(events.get(0).getString("owner"), "B", "scanner observer captures successor owner");
            equal(events.get(0).getArray("available"), List.of("speaker", "earpiece"), "restored output advertised");
        });
        test("failed_listener_removal_retains_retryable_cleanup", () -> {
            Fixture f = new Fixture(); java.util.ArrayList<WritableMap> events = new java.util.ArrayList<>();
            f.owned.setRouteListener(events::add); f.acquireReady("A"); events.clear(); f.system.throwOnRemoveListener = true;
            Reply release = f.release("A"); Handler.drain(); release.error("E_AUDIO_STOP");
            equal(AudioSwitch.stops, 1, "listener failure must not prevent manager stop"); equal(f.system.clearCalls, 1, "listener failure must not prevent route clear");
            equal(f.system.registeredListenerCount(), 1, "failed removal retains actual listener");
            f.system.selected = f.speaker; f.system.emitRouteChanged(); Handler.drain();
            equal(events.size(), 0, "retained failed-removal listener remains owner fenced");
            Reply b = f.acquire("B"); Handler.drain(); b.error("E_AUDIO_STOP"); equal(AudioSwitch.constructed, 1, "successor cannot bypass retained cleanup");
            f.system.throwOnRemoveListener = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(f.system.registeredListenerCount(), 0, "exact owner retries retained removal handle");
            equal(f.system.removedListeners, 3, "initial release, rejected successor, and exact-owner retry each attempt removal");
            f.acquireReady("C"); events.clear(); f.system.emitRouteChanged(); Handler.drain();
            equal(events.size(), 1, "one successor listener remains"); equal(events.get(0).getString("owner"), "C", "only successor emits");
        });
        test("invalidate_listener_failure_is_contained_and_retryable", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.throwOnRemoveListener = true;
            f.owned.invalidate(); Handler.drain();
            equal(AudioSwitch.stops, 1, "invalidation still stops manager"); equal(f.system.clearCalls, 1, "invalidation still clears route");
            equal(f.system.registeredListenerCount(), 1, "failed invalidation retains listener handle");
            f.system.throwOnRemoveListener = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(f.system.registeredListenerCount(), 0, "exact cleanup after invalidation retries removal");
        });
        test("invalidate_pending_once", () -> {
            Fixture f = new Fixture(); f.acquireReady("A"); f.system.applySetter = false;
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            f.owned.invalidate(); select.error("E_AUDIO_STALE"); Handler.drain();
            equal(AudioSwitch.stops, 1, "invalidate stops manager"); equal(f.system.clearCalls, 1, "invalidate clears route");
            Handler.advance(5000); select.error("E_AUDIO_STALE");
            f.acquire("B").error("E_AUDIO_OWNER"); f.manager.start(); Handler.drain(); equal(AudioSwitch.starts, 1, "invalidated module restarted");
        });
        test("api_below_31_fails_closed", () -> {
            Fixture f = new Fixture(); Build.VERSION.SDK_INT = 30;
            Reply acquire = f.acquire("A"); Handler.drain(); WritableMap receipt = acquire.receipt();
            equal(receipt.getBoolean("supported"), false, "old API capability"); equal(receipt.getString("selected"), "none", "old API cannot prove route");
            f.select("A", "speaker").error("E_AUDIO_UNSUPPORTED"); Reply read = f.read("A"); Handler.drain(); read.success();
            f.release("A"); Handler.drain(); equal(f.system.readCalls + f.system.availableCalls + f.system.setCalls + f.system.clearCalls + f.system.addedListeners + f.system.removedListeners, 0, "API31 framework calls below 31");
        });
        test("api30_acquire_before_playout_is_nonblocking_and_unconfirmed", () -> {
            LegacyFixture f = new LegacyFixture(); Reply acquire = f.acquire("A"); Handler.drain();
            equal(acquire.receipt().getString("selected"), "none", "no playing track cannot imply receiver");
            equal(AudioSwitch.starts, 1, "routing session starts before call playout");
            Reply select = f.select("A", "speaker"); Handler.advance(3000);
            check(select.error != null, "selection without playout must fail, not claim speaker");
            equal(f.system.speakerCalls, 0, "unknown playback cannot issue a manual route change");
            f.startTrack(f.earpiece);
            Reply read = f.read("A"); Handler.drain();
            equal(read.receipt().getString("selected"), "earpiece", "later actual playout makes routing observable");
            f.noApi31();
        });
        test("api30_requested_flag_and_scanner_are_not_playback_route_proof", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            check(f.system.requestedSpeaker, "API30 actuator must issue speaker request");
            check(AudioSwitch.instances.get(0).cached instanceof AudioDevice.Speakerphone, "SDK preference updated");
            equal(f.track.routedDevice, f.earpiece, "actual playback deliberately remains on receiver");
            Handler.advance(2450); select.pending();
            f.route(f.speaker);
            equal(select.receipt().getString("selected"), "speaker", "only actual route completes selection");
            f.noApi31();
        });
        test("api30_unapplied_request_times_out_without_false_label", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            Reply select = f.select("A", "speaker"); Handler.advance(3000);
            select.error("E_AUDIO_TIMEOUT");
            Reply read = f.read("A"); Handler.drain();
            equal(read.receipt().getString("selected"), "earpiece", "read reports actual old route after failed request");
            equal(AudioSwitch.stops, 0, "route timeout does not stop the call session"); f.noApi31();
        });
        test("api30_video_acquire_reports_actual_route_not_default_preference", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece);
            Reply acquire = f.acquire("A", "speaker"); Handler.drain();
            equal(acquire.receipt().getString("selected"), "earpiece", "default speaker request is not selected proof");
            f.noApi31();
        });
        test("api30_shared_actual_factory_adm_is_required", () -> {
            for (String mismatch : List.of("factory", "options", "livekit")) {
                LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
                JavaAudioDeviceModule foreign = new JavaAudioDeviceModule(); foreign.setFixtureTrack(new AudioTrack(f.speaker));
                if ("factory".equals(mismatch)) f.factory.replaceFixtureAdm(foreign);
                if ("options".equals(mismatch)) WebRTCModuleOptions.getInstance().audioDeviceModule = foreign;
                if ("livekit".equals(mismatch)) LiveKitReactNative.INSTANCE.setFixtureAdm(foreign);
                equal(onMain(() -> f.probe.currentTrack()), null, "mismatched actual ADM cannot be observed: " + mismatch);
                Reply select = f.select("A", "speaker"); Handler.advance(3000);
                check(select.error != null, "foreign ADM must not confirm a route: " + mismatch);
                equal(f.system.speakerCalls, 0, "foreign ADM cannot receive route actuator: " + mismatch); f.noApi31();
            }
        });
        test("api30_replaced_track_cannot_complete_old_selection", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            AudioTrack old = f.track; Object token = onMain(() -> f.probe.currentTrack());
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            old.playState = AudioTrack.PLAYSTATE_STOPPED; f.observer.onWebRtcAudioTrackStop();
            f.startTrack(f.speaker); Handler.advance(3000);
            check(select.error != null, "a new track matching the request cannot settle an old-track command");
            equal(onMain(() -> f.probe.selectedDevice(token)), null, "old track token stays invalid");
            Reply retry = f.select("A", "speaker"); Handler.drain();
            equal(retry.receipt().getString("selected"), "speaker", "explicit retry can bind the new current track");
            equal(old.playCalls + old.stopCalls + old.releaseCalls, 0, "observer cannot mutate old playback"); f.noApi31();
        });
        test("api30_inner_track_replacement_during_read_fails_closed", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            Object token = onMain(() -> f.probe.currentTrack());
            f.track.duringRead = () -> f.adm.setFixtureTrack(new AudioTrack(f.speaker));
            equal(onMain(() -> f.probe.selectedDevice(token)), null, "before/after inner track mismatch cannot return old route");
            equal(onMain(() -> f.probe.currentTrack()), null, "replacement without its START cannot inherit the old observation");
            f.noApi31();
        });
        test("api30_factory_replacement_during_read_fails_closed", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            Object token = onMain(() -> f.probe.currentTrack());
            f.track.duringRead = () -> f.factory.replaceFixtureAdm(new JavaAudioDeviceModule());
            equal(onMain(() -> f.probe.selectedDevice(token)), null,
                "actual factory change during the framework read cannot confirm the old ADM route");
            f.noApi31();
        });
        test("api30_queued_old_stop_and_route_callbacks_preserve_new_track", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            AudioTrack old = f.track; Object oldToken = onMain(() -> f.probe.currentTrack());
            java.util.ArrayList<String> events = new java.util.ArrayList<>();
            f.owned.setRouteListener(receipt -> events.add(receipt.getString("selected")));
            old.routedDevice = f.speaker; old.emitRouteChanged();
            old.playState = AudioTrack.PLAYSTATE_STOPPED;
            f.observer.onWebRtcAudioTrackStop(); // Captures old track before main runs.
            f.track = new AudioTrack(f.earpiece); f.adm.setFixtureTrack(f.track);
            f.observer.onWebRtcAudioTrackStart(); // Publishes the replacement before queued old callbacks.
            Handler.drain();
            check(onMain(() -> f.probe.currentTrack()) != oldToken, "new track receives a distinct observation token");
            equal(onMain(() -> f.probe.selectedDevice(oldToken)), null, "old observation remains retired");
            check(!events.isEmpty() && events.stream().allMatch("earpiece"::equals),
                "queued old callback cannot publish old route or erase new playing state");
            equal(old.listenerCount(), 0, "old listener detached after playback replacement");
            equal(f.track.listenerCount(), 1, "only current track remains observed");
            f.release("A"); Handler.drain(); equal(f.track.listenerCount(), 0, "End removes replacement listener");
            f.noApi31();
        });
        test("api30_retired_request_cannot_select_or_stop_successor_owner", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            Reply pending = f.select("A", "speaker"); Handler.drain(); pending.pending();
            Reply end = f.release("A"), next = f.acquire("B"); Handler.drain();
            pending.error("E_AUDIO_STALE"); end.success(); next.success();
            int requests = f.system.speakerCalls, stops = AudioSwitch.stops;
            f.track.routedDevice = f.speaker; f.track.emitRouteChanged(); Handler.advance(3000);
            equal(f.system.speakerCalls, requests, "late old request cannot actuate the successor");
            equal(AudioSwitch.stops, stops, "late old request cannot stop the successor");
            Reply read = f.read("B"); Handler.drain();
            equal(read.receipt().getString("selected"), "speaker", "current owner observes actual current playback");
            f.release("B"); Handler.drain(); f.noApi31();
        });
        test("api30_stopped_or_unrouted_track_never_means_earpiece", () -> {
            for (String unavailable : List.of("stopped", "paused", "released", "unrouted")) {
                LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
                if ("stopped".equals(unavailable)) f.track.playState = AudioTrack.PLAYSTATE_STOPPED;
                if ("paused".equals(unavailable)) f.track.playState = AudioTrack.PLAYSTATE_PAUSED;
                if ("released".equals(unavailable)) f.track.state = AudioTrack.STATE_UNINITIALIZED;
                if ("unrouted".equals(unavailable)) f.track.routedDevice = null;
                Reply read = f.read("A"); Handler.advance(3000);
                check(read.error != null || "none".equals(read.receipt().getString("selected")),
                    "unavailable playback cannot be receiver: " + unavailable);
                if (!"unrouted".equals(unavailable)) {
                    Reply select = f.select("A", "speaker"); Handler.advance(3000);
                    check(select.error != null, "nonplaying track cannot complete a route command: " + unavailable);
                    equal(f.system.speakerCalls, 0, "nonplaying track cannot authorize the speaker actuator: " + unavailable);
                }
                f.noApi31();
            }
        });
        test("api30_actual_track_read_error_never_becomes_route_success", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            f.track.throwOnRead = true; Reply read = f.read("A"); Handler.advance(3000);
            check(read.error != null || "none".equals(read.receipt().getString("selected")), "route read failure cannot fabricate a device");
            equal(AudioSwitch.stops, 0, "readback failure does not end the call"); f.noApi31();
        });
        test("api30_end_retires_track_listener_and_pending_selection", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            check(f.track.listenerCount() > 0, "actual track listener must be registered");
            Reply select = f.select("A", "speaker"); Handler.drain(); select.pending();
            f.track.emitRouteChanged(); Reply end = f.release("A"); Handler.drain();
            end.success(); select.error("E_AUDIO_STALE");
            equal(f.track.listenerCount(), 0, "End removes only its own track listener");
            int requests = f.system.speakerCalls; Handler.advance(3000);
            equal(f.system.speakerCalls, requests, "late pending request cannot mutate after End"); f.noApi31();
        });
        test("api30_failed_track_listener_removal_is_retryable", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            f.track.throwOnRemove = true; Reply first = f.release("A"); Handler.drain();
            check(first.error != null, "failed listener cleanup must remain unproved");
            check(f.track.listenerCount() > 0, "injected failure keeps actual listener attached");
            f.track.throwOnRemove = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(f.track.listenerCount(), 0, "exact-owner retry removes retained track listener"); f.noApi31();
        });
        test("api30_failed_old_listener_detach_blocks_replacement_receipt", () -> {
            LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece); f.acquireReady("A");
            AudioTrack old = f.track; old.throwOnRemove = true;
            old.playState = AudioTrack.PLAYSTATE_STOPPED; f.observer.onWebRtcAudioTrackStop();
            f.startTrack(f.speaker);
            check(!f.probe.isAvailable(), "failed old-track detach must revoke observation readiness");
            Reply read = f.read("A"); Handler.advance(3000);
            check(read.error != null || (!read.receipt().getBoolean("supported")
                    && "none".equals(read.receipt().getString("selected"))),
                "unobserved successor cannot inherit the old listener's capability");
            check(old.listenerCount() > 0, "failed old binding must remain available for exact cleanup");
            Reply firstEnd = f.release("A"); Handler.drain();
            check(firstEnd.error != null, "End cannot discard failed old listener removal");
            old.throwOnRemove = false; Reply retry = f.release("A"); Handler.drain(); retry.success();
            equal(old.listenerCount(), 0, "End retry removes the retained old binding");
            equal(f.track.listenerCount(), 0, "unobserved successor has no leaked listener");
            f.noApi31();
        });
        test("api30_failed_track_listener_registration_revokes_observer_capability", () -> {
            for (boolean partial : List.of(false, true)) {
                LegacyFixture f = new LegacyFixture(); f.startTrack(f.earpiece);
                f.track.throwOnAdd = !partial; f.track.throwAfterAdd = partial;
                Reply acquire = f.acquire("A"); Handler.drain(); acquire.success();
                check(!acquire.receipt().getBoolean("supported"),
                    "acquire must not briefly advertise readiness before failed listener registration");
                check(!f.probe.isAvailable(), "failed observer registration must not advertise readiness");
                Reply read = f.read("A"); Handler.advance(3000);
                check(read.error != null || !read.receipt().getBoolean("supported"),
                    "missing observation cannot leave a route control active");
                Reply end = f.release("A"); Handler.drain(); end.success();
                equal(f.track.listenerCount(), 0, "End removes any partial registration");
                f.track.throwOnAdd = false; f.track.throwAfterAdd = false;
                Reply next = f.acquire("B"); Handler.drain(); next.success();
                Reply restored = f.read("B"); Handler.drain();
                equal(restored.receipt().getString("selected"), "earpiece", "a later owned subscription can restore observation");
                f.noApi31();
            }
        });
        test("default_order_before_activation", () -> {
            for (String output : List.of("earpiece", "speaker", "system")) {
                Fixture f = new Fixture(); Reply acquire = f.acquire("A", output); Handler.drain(); acquire.success();
                List<Class<? extends AudioDevice>> order = AudioSwitch.instances.get(0).preferencesAtActivation;
                equal(order.get(0), AudioDevice.BluetoothHeadset.class, "Bluetooth must retain priority");
                equal(order.get(1), AudioDevice.WiredHeadset.class, "headset must retain priority");
                equal(order.get(2), output.equals("earpiece") ? AudioDevice.Earpiece.class : AudioDevice.Speakerphone.class, "default chosen before activation");
            }
        });
        test("external_device_priority", () -> {
            Fixture f = new Fixture();
            AudioDeviceInfo bluetooth = new AudioDeviceInfo(AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
            f.system.available.add(bluetooth); AudioSwitch.scanner.add(new AudioDevice.BluetoothHeadset());
            Reply acquire = f.acquire("A"); Handler.drain(); equal(acquire.receipt().getString("selected"), "other", "external selected device must remain external");
            equal(f.system.selected, bluetooth, "voice default must not steal Bluetooth"); equal(f.system.setCalls, 0, "acquire must not force earpiece");
        });
        test("os_available_but_scanner_missing_not_advertised", () -> {
            Fixture f = new Fixture(); AudioSwitch.scanner.removeIf(device -> device instanceof AudioDevice.Earpiece);
            Reply acquire = f.acquire("A", "speaker"); Handler.drain();
            equal(acquire.receipt().getArray("available"), List.of("speaker"), "unselectable earpiece must not be advertised");
            Reply read = f.read("A"); Handler.drain();
            equal(read.receipt().getArray("available"), List.of("speaker"), "read must use actual scanner capability");
        });
        test("conflict_does_not_steal_owner", () -> {
            Fixture f = new Fixture(); Reply a = f.acquire("A");
            f.acquire("B").error("E_AUDIO_CONFLICT"); Handler.drain(); a.success();
            equal(AudioSwitch.starts, 1, "conflict started another switch");
        });
        test("raw_lifecycle_works_without_lease", () -> {
            Fixture f = new Fixture(); f.manager.start(); Handler.drain(); equal(AudioSwitch.starts, 1, "raw start");
            f.manager.selectAudioOutput(AudioDeviceKind.SPEAKER); Handler.drain(); equal(AudioSwitch.selections, 1, "raw select");
            f.manager.stop(); Handler.drain(); equal(AudioSwitch.stops, 1, "raw stop");
        });
        if (passed + failed == 0) throw new AssertionError("Unknown case: " + filter);
        System.out.println("Owned Android audio contract: " + passed + " passed, " + failed + " failures");
        if (failed != 0) System.exit(1);
    }
}
