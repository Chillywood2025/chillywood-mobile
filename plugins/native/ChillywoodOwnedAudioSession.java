package com.livekit.reactnative.audio;

import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** One owner of the existing AudioSwitch. No room, provider, or second audio manager. */
public final class ChillywoodOwnedAudioSession {
    private static final long CONFIRM_TIMEOUT_MS = 2500;
    private static final long POLL_MS = 50;
    private final Object lock = new Object();
    private final AudioSwitchManager manager;
    private final AudioManager systemAudio;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String desiredOwner;
    private String activeOwner;
    private long lifecycle;
    private long request;
    private boolean ready;
    private boolean invalidated;
    private Pending pending;
    private RouteListener routeListener;
    private Runnable removeRouteListener;
    private String automaticOutput;
    private LegacyRouteProbe legacyProbe;
    private boolean legacyProbeFailed;

    public interface LegacyRouteProbe {
        boolean isAvailable();
        Object currentTrack();
        AudioDeviceInfo selectedDevice(Object expectedTrack);
        Runnable subscribe(Runnable changed);
    }

    public void setLegacyRouteProbe(LegacyRouteProbe probe) {
        synchronized (lock) {
            if (desiredOwner != null || activeOwner != null) throw new IllegalStateException("Audio session is active.");
            legacyProbe = probe;
            legacyProbeFailed = false;
        }
    }

    public interface RouteListener { void onRouteChanged(WritableMap receipt); }

    public void setRouteListener(RouteListener listener) { synchronized (lock) { routeListener = listener; } }

    /** Capture the lifetime of this AudioSwitch, including availability-only changes. */
    public Runnable createDeviceChangeObserver() {
        synchronized (lock) {
            final String owner = desiredOwner;
            final long epoch = lifecycle;
            return () -> main.post(() -> {
                synchronized (lock) {
                    if (!ownedReady(owner, epoch)) return;
                    // An initial builtin correction must not pin the call away
                    // from a newly selected accessory. Manual selection keeps
                    // its explicit request and the SDK's user-selected policy.
                    if (automaticOutput != null && !"none".equals(manager.ownedSelectedOutputOnMainThread())
                            && !automaticOutput.equals(manager.ownedSelectedOutputOnMainThread())) {
                        try {
                            systemAudio.clearCommunicationDevice();
                            automaticOutput = null;
                        } catch (RuntimeException ignored) { /* retain for a later device-change retry */ }
                    }
                    emitCurrentRoute(owner, epoch);
                }
            });
        }
    }

    private static final class Pending {
        final String owner;
        final long lifecycle;
        final long request;
        final Promise promise;
        final String output;
        final boolean acquiring;
        final long deadline;
        boolean settled;
        boolean selectionIssued;
        Object trackBinding;
        Pending(String owner, long lifecycle, long request, Promise promise, String output, boolean acquiring) {
            this.owner = owner;
            this.lifecycle = lifecycle;
            this.request = request;
            this.promise = promise;
            this.output = output;
            this.acquiring = acquiring;
            this.deadline = SystemClock.elapsedRealtime() + CONFIRM_TIMEOUT_MS;
        }
    }

    public ChillywoodOwnedAudioSession(Context context, AudioSwitchManager manager) {
        this.manager = manager;
        this.systemAudio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    }

    public void acquire(String owner, String defaultOutput, Promise promise) {
        synchronized (lock) {
            if (invalidated || owner == null || owner.isEmpty() || owner.length() > 160) {
                reject(promise, "E_AUDIO_OWNER", "Audio session owner is unavailable.");
                return;
            }
            // A caller allocates a unique, single-use lease. Even a duplicate
            // acquire is rejected: it cannot silently become a second lifetime.
            if (desiredOwner != null) {
                reject(promise, "E_AUDIO_CONFLICT", "Another audio session is active.");
                return;
            }
            if (!"speaker".equals(defaultOutput) && !"earpiece".equals(defaultOutput) && !"system".equals(defaultOutput)) {
                reject(promise, "E_AUDIO_OUTPUT", "Initial audio output is unsupported.");
                return;
            }
            desiredOwner = owner;
            ready = false;
            legacyProbeFailed = false;
            final long epoch = ++lifecycle;
            final long revision = ++request;
            main.post(() -> {
                synchronized (lock) {
                    if (!current(owner, epoch, revision)) {
                        reject(promise, "E_AUDIO_STALE", "Audio session was replaced.");
                        return;
                    }
                    try {
                        // A successor can reserve ownership before the old stop
                        // runs. Reset the predecessor's cached user selection and
                        // explicit OS route before activating the new default.
                        if (activeOwner != null || manager.isStartedOnMainThread()) {
                            try { stopOwnedOnMainThread(); }
                            catch (RuntimeException error) {
                                // Preserve the predecessor's retained cleanup
                                // owner. The successor has not started anything.
                                desiredOwner = null;
                                ++lifecycle;
                                ++request;
                                reject(promise, "E_AUDIO_STOP", "Previous audio session could not stop.");
                                return;
                            }
                            activeOwner = null;
                        }
                        manager.prepareOwnedDefaultOnMainThread(defaultOutput);
                        activeOwner = owner;
                        manager.startOnMainThread();
                        if (!api31()) {
                            // The real track starts only after the call connects.
                            // Never deadlock Room.connect on playout-route proof.
                            ready = true;
                            installRouteListenerOnMainThread(owner, epoch);
                            promise.resolve(snapshot(owner));
                            return;
                        }
                        pending = new Pending(owner, epoch, revision, promise, defaultOutput, true);
                        observe(pending);
                    } catch (RuntimeException error) {
                        failAcquire(owner, epoch);
                        reject(promise, "E_AUDIO_START", "Audio session could not start.");
                    }
                }
            });
        }
    }

    public void release(String owner, Promise promise) {
        synchronized (lock) {
            if (owner == null || (!owner.equals(desiredOwner) && !owner.equals(activeOwner))) {
                promise.resolve(true);
                return;
            }
            if (owner.equals(desiredOwner)) {
                desiredOwner = null;
                ready = false;
                ++lifecycle;
                ++request;
                cancelPending();
            }
            main.post(() -> {
                synchronized (lock) {
                    // Clean only the actual predecessor, even when a successor
                    // is reserved but not yet started. Do not falsely report
                    // successful cleanup that the successor might fail to do.
                    // Once the successor starts, this old release is a no-op.
                    if (owner.equals(activeOwner)) {
                        try {
                            stopOwnedOnMainThread();
                            activeOwner = null;
                        } catch (RuntimeException error) {
                            reject(promise, "E_AUDIO_STOP", "Audio session could not stop.");
                            return;
                        }
                    }
                    promise.resolve(true);
                }
            });
        }
    }

    public void read(String owner, Promise promise) {
        synchronized (lock) {
            final long epoch = lifecycle;
            final long deadline = SystemClock.elapsedRealtime() + CONFIRM_TIMEOUT_MS;
            main.post(() -> { synchronized (lock) { observeRead(owner, epoch, promise, deadline); } });
        }
    }

    public void select(String owner, String output, Promise promise) {
        synchronized (lock) {
            if (!ownedReady(owner, lifecycle)) {
                reject(promise, "E_AUDIO_STALE", "Audio session is not current.");
                return;
            }
            if (!"speaker".equals(output) && !"earpiece".equals(output)) {
                reject(promise, "E_AUDIO_OUTPUT", "Audio output is unsupported.");
                return;
            }
            if (!supported()) {
                reject(promise, "E_AUDIO_UNSUPPORTED", "Confirmed audio routing is unavailable.");
                return;
            }
            final long epoch = lifecycle;
            final long revision = ++request;
            cancelPending();
            main.post(() -> {
                synchronized (lock) {
                    if (!current(owner, epoch, revision) || !ready) {
                        reject(promise, "E_AUDIO_STALE", "Audio route request was replaced.");
                        return;
                    }
                    try {
                        Object trackBinding = api31() ? null : legacyProbe.currentTrack();
                        if (!api31() && trackBinding == null) {
                            reject(promise, "E_AUDIO_ROUTE_PENDING", "Call audio playback is not ready.");
                            return;
                        }
                        if (!systemAvailable().contains(output)) {
                            reject(promise, "E_AUDIO_UNAVAILABLE", "Requested audio output is unavailable.");
                            return;
                        }
                        pending = new Pending(owner, epoch, revision, promise, output, false);
                        pending.trackBinding = trackBinding;
                        observe(pending);
                    } catch (RuntimeException error) {
                        reject(promise, "E_AUDIO_SELECT", "Audio output selection failed.");
                    }
                }
            });
        }
    }

    /** Used by the upstream unowned API; it cannot interfere with a live lease. */
    public void runUnowned(Runnable operation) {
        synchronized (lock) {
            final long epoch = lifecycle;
            if (invalidated || desiredOwner != null || activeOwner != null) return;
            main.post(() -> {
                synchronized (lock) {
                    if (!invalidated && desiredOwner == null && activeOwner == null && lifecycle == epoch) operation.run();
                }
            });
        }
    }

    public void invalidate() {
        synchronized (lock) {
            invalidated = true;
            desiredOwner = null;
            ready = false;
            ++lifecycle;
            ++request;
            cancelPending();
            main.post(() -> {
                synchronized (lock) {
                    try { stopOwnedOnMainThread(); activeOwner = null; }
                    catch (RuntimeException ignored) { /* teardown must not escape the main looper */ }
                    finally { routeListener = null; }
                }
            });
        }
    }

    // All observations and mutations execute under the same lock on the main
    // looper. Reserving a new owner/request cannot race a check and native write.
    private void observe(Pending operation) {
        if (operation.settled) return;
        if (!current(operation.owner, operation.lifecycle, operation.request)) {
            settleError(operation, "E_AUDIO_STALE", "Audio route request was replaced.");
            return;
        }
        try {
            if (!operation.acquiring && !api31() && !trackCurrent(operation)) {
                settleError(operation, "E_AUDIO_STALE", "Call audio playback was replaced.");
                return;
            }
            if (operation.acquiring && automaticOutput != null) {
                String scannerOutput = manager.ownedSelectedOutputOnMainThread();
                if (!"none".equals(scannerOutput) && !automaticOutput.equals(scannerOutput)) {
                    systemAudio.clearCommunicationDevice();
                    automaticOutput = null;
                }
            }
            boolean defaultReady = !operation.acquiring || acquisitionDefaultReady(operation);
            if (operation.acquiring && defaultReady && !operation.selectionIssued) {
                String preferred = manager.ownedSelectedOutputOnMainThread();
                if (("speaker".equals(preferred) || "earpiece".equals(preferred))
                        && !preferred.equals(selected()) && !"other".equals(selected())
                        && !systemAvailable().contains("other")) {
                    AudioDeviceInfo target = communicationDevice(preferred);
                    if (target != null) {
                        if (!systemAudio.setCommunicationDevice(target)) {
                            failAcquire(operation.owner, operation.lifecycle);
                            settleError(operation, "E_AUDIO_SELECT", "Android rejected the initial audio output.");
                            return;
                        }
                        operation.selectionIssued = true;
                        automaticOutput = preferred;
                    }
                }
            }
            if (!operation.acquiring && !operation.selectionIssued) {
                AudioDeviceInfo target = communicationDevice(operation.output);
                if (target == null) {
                    settleError(operation, "E_AUDIO_UNAVAILABLE", "Requested audio output is unavailable.");
                    return;
                }
                // AudioSwitch discovers its devices asynchronously. Keep its
                // preference consistent with Android, but do not mistake that
                // preference (or a successful setter) for selected-route proof.
                if (manager.selectAudioOutputOnMainThread(AudioDeviceKind.fromTypeName(operation.output))) {
                    automaticOutput = null;
                    if (api31() && !systemAudio.setCommunicationDevice(target)) {
                        settleError(operation, "E_AUDIO_SELECT", "Android rejected the requested audio output.");
                        return;
                    }
                    if (!api31()) systemAudio.setSpeakerphoneOn("speaker".equals(operation.output));
                    operation.selectionIssued = true;
                }
            }
            String selected = !operation.acquiring && !api31()
                    ? kind(legacyProbe.selectedDevice(operation.trackBinding)) : selected();
            boolean confirmed = operation.acquiring ? defaultReady && !"none".equals(selected) && !available().isEmpty()
                    && manager.ownedDefaultObservedOnMainThread(selected)
                : operation.selectionIssued && operation.output.equals(selected);
            if (confirmed) {
                WritableMap receipt = snapshot(operation.owner);
                // snapshot performs a fresh read. A route may change between two
                // framework calls; never return a contradictory success receipt.
                String receiptOutput = receipt.getString("selected");
                if (!operation.acquiring && !api31() && !trackCurrent(operation)) {
                    settleError(operation, "E_AUDIO_STALE", "Call audio playback was replaced.");
                    return;
                }
                if (receiptContainsOutput(receipt, receiptOutput) && (operation.acquiring ? acquisitionDefaultReady(operation) && !"none".equals(receiptOutput)
                        && manager.ownedDefaultObservedOnMainThread(receiptOutput)
                        : operation.output.equals(receiptOutput))) {
                    if (operation.acquiring) {
                        ready = true;
                        installRouteListenerOnMainThread(operation.owner, operation.lifecycle);
                    }
                    operation.settled = true;
                    if (pending == operation) pending = null;
                    operation.promise.resolve(receipt);
                    return;
                }
            }
            if (SystemClock.elapsedRealtime() >= operation.deadline) {
                if (operation.acquiring) failAcquire(operation.owner, operation.lifecycle);
                settleError(operation, "E_AUDIO_TIMEOUT", "Android did not confirm the selected audio output.");
                return;
            }
            main.postDelayed(() -> { synchronized (lock) { observe(operation); } }, POLL_MS);
        } catch (RuntimeException error) {
            if (operation.acquiring) failAcquire(operation.owner, operation.lifecycle);
            settleError(operation, "E_AUDIO_READ", "Selected audio output is unavailable.");
        }
    }

    private boolean acquisitionDefaultReady(Pending operation) {
        String scannerOutput = manager.ownedSelectedOutputOnMainThread();
        if ("none".equals(scannerOutput)) return false;
        if ("other".equals(scannerOutput)) return true;
        String preferred = "system".equals(operation.output) ? "speaker" : operation.output;
        // A partial scanner callback must not confirm a temporary fallback
        // while Android already reports the preferred builtin is available.
        return !systemAvailable().contains(preferred) || preferred.equals(scannerOutput);
    }

    private AudioDeviceInfo communicationDevice(String output) {
        for (AudioDeviceInfo device : communicationDevices()) {
            if (output.equals(kind(device))) return device;
        }
        return null;
    }

    private boolean trackCurrent(Pending operation) {
        return supported() && operation.trackBinding != null && legacyProbe.currentTrack() == operation.trackBinding;
    }

    private void observeRead(String owner, long epoch, Promise promise, long deadline) {
        if (!ownedReady(owner, epoch)) {
            reject(promise, "E_AUDIO_STALE", "Audio session is not current.");
            return;
        }
        try {
            WritableMap receipt = snapshot(owner);
            if (!supported() || (!"none".equals(receipt.getString("selected")) && receipt.getArray("available").size() > 0)) {
                promise.resolve(receipt);
                return;
            }
            if (SystemClock.elapsedRealtime() >= deadline) {
                reject(promise, "E_AUDIO_TIMEOUT", "Android audio outputs are not ready.");
                return;
            }
            main.postDelayed(() -> { synchronized (lock) { observeRead(owner, epoch, promise, deadline); } }, POLL_MS);
        } catch (RuntimeException error) {
            reject(promise, "E_AUDIO_READ", "Selected audio output is unavailable.");
        }
    }

    private boolean current(String owner, long epoch, long revision) {
        return !invalidated && owner != null && owner.equals(desiredOwner) && epoch == lifecycle && revision == request;
    }

    private boolean ownedReady(String owner, long epoch) {
        return !invalidated && ready && owner != null && owner.equals(desiredOwner) && owner.equals(activeOwner) && epoch == lifecycle;
    }

    private boolean api31() { return Build.VERSION.SDK_INT >= 31 && systemAudio != null; }

    private boolean supported() {
        if (api31()) return true;
        try { return systemAudio != null && !legacyProbeFailed && legacyProbe != null && legacyProbe.isAvailable(); }
        catch (RuntimeException unavailable) { return false; }
    }

    private String selected() {
        if (api31()) return kind(systemAudio.getCommunicationDevice());
        return supported() ? kind(legacyProbe.selectedDevice(null)) : "none";
    }

    private List<String> available() {
        List<String> result = new ArrayList<>();
        for (String output : systemAvailable()) {
            // The pinned scanner can remove the earpiece while a wired headset
            // is attached. Do not advertise a built-in this manager cannot select.
            if ("other".equals(output) || manager.ownedOutputAvailableOnMainThread(output)) result.add(output);
        }
        return result;
    }

    private List<String> systemAvailable() {
        List<String> result = new ArrayList<>();
        if (supported()) {
            for (AudioDeviceInfo device : communicationDevices()) {
                String value = kind(device);
                if (!"none".equals(value) && !result.contains(value)) result.add(value);
            }
        }
        return result;
    }

    private List<AudioDeviceInfo> communicationDevices() {
        if (api31()) return systemAudio.getAvailableCommunicationDevices();
        if (supported()) return Arrays.asList(systemAudio.getDevices(AudioManager.GET_DEVICES_OUTPUTS));
        return new ArrayList<>();
    }

    private static String kind(AudioDeviceInfo device) {
        if (device == null) return "none";
        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return "speaker";
        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return "earpiece";
        return "other";
    }

    private WritableMap snapshot(String owner) {
        WritableMap result = Arguments.createMap();
        result.putString("owner", owner);
        result.putBoolean("supported", supported());
        result.putString("selected", selected());
        WritableArray outputs = Arguments.createArray();
        for (String output : available()) outputs.pushString(output);
        result.putArray("available", outputs);
        return result;
    }

    private static boolean receiptContainsOutput(WritableMap receipt, String output) {
        for (int index = 0; index < receipt.getArray("available").size(); index++) {
            if (output.equals(receipt.getArray("available").getString(index))) return true;
        }
        return false;
    }

    private void failAcquire(String owner, long epoch) {
        if (owner.equals(desiredOwner) && lifecycle == epoch) {
            desiredOwner = null;
            ready = false;
            ++lifecycle;
            ++request;
            try { stopOwnedOnMainThread(); activeOwner = null; }
            catch (RuntimeException ignored) { /* retain owner so exact release can retry cleanup */ }
        }
    }

    private void stopOwnedOnMainThread() {
        try { removeRouteListenerOnMainThread(); }
        finally {
            try { manager.stopOnMainThread(); }
            finally {
                if (api31()) systemAudio.clearCommunicationDevice();
                automaticOutput = null;
            }
        }
    }

    private void installRouteListenerOnMainThread(String owner, long epoch) {
        removeRouteListenerOnMainThread();
        if (api31()) {
            removeRouteListener = Api31Routes.install(systemAudio, main, () -> emitCurrentRoute(owner, epoch));
        } else if (legacyProbe != null) {
            try { removeRouteListener = legacyProbe.subscribe(() -> emitCurrentRoute(owner, epoch)); }
            catch (RuntimeException unavailable) { legacyProbeFailed = true; }
        }
    }

    private void emitCurrentRoute(String owner, long epoch) {
        synchronized (lock) {
            if (!ownedReady(owner, epoch) || routeListener == null) return;
            try { routeListener.onRouteChanged(snapshot(owner)); }
            catch (RuntimeException ignored) { /* a later explicit read remains available */ }
        }
    }

    private void removeRouteListenerOnMainThread() {
        Runnable remove = removeRouteListener;
        if (remove != null) {
            remove.run();
            removeRouteListener = null;
        }
    }

    // Keep the API31-only listener type out of the coordinator's fields and
    // constructor, so older Android can still start an owned audio session.
    private static final class Api31Routes {
        static Runnable install(AudioManager audio, Handler main, Runnable changed) {
            AudioManager.OnCommunicationDeviceChangedListener listener = device -> changed.run();
            audio.addOnCommunicationDeviceChangedListener(command -> main.post(command), listener);
            return () -> audio.removeOnCommunicationDeviceChangedListener(listener);
        }
    }

    private void cancelPending() {
        if (pending != null) settleError(pending, "E_AUDIO_STALE", "Audio route request was replaced.");
    }

    private void settleError(Pending operation, String code, String message) {
        if (operation.settled) return;
        operation.settled = true;
        if (pending == operation) pending = null;
        reject(operation.promise, code, message);
    }

    private static void reject(Promise promise, String code, String message) { promise.reject(code, message); }
}
