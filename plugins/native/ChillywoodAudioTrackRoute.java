package org.webrtc.audio;

import android.media.AudioDeviceInfo;
import android.media.AudioRouting;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;
import com.facebook.react.bridge.ReactApplicationContext;
import com.livekit.reactnative.LiveKitReactNative;
import com.livekit.reactnative.audio.ChillywoodOwnedAudioSession;
import com.oney.WebRTCModule.ChillywoodAudioModuleAccessor;
import com.oney.WebRTCModule.WebRTCModuleOptions;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Observes the existing shared WebRTC playout only. The pinned SDK exposes the
 * ADM's audioOutput, but its Android AudioTrack is private. Reflection is limited
 * to that one app-library field; no hidden Android API or playback mutation.
 */
public final class ChillywoodAudioTrackRoute implements ChillywoodOwnedAudioSession.LegacyRouteProbe {
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicReference<Observer> ACTIVE = new AtomicReference<>();
    private static final CopyOnWriteArrayList<Subscription> SUBSCRIPTIONS = new CopyOnWriteArrayList<>();
    private static final Field TRACK_FIELD = trackField();
    private final ReactApplicationContext context;

    public ChillywoodAudioTrackRoute(ReactApplicationContext context) { this.context = context; }

    private static Field trackField() {
        try {
            Field field = WebRtcAudioTrack.class.getDeclaredField("audioTrack");
            if (field.getType() != AudioTrack.class || !Modifier.isPrivate(field.getModifiers())
                    || Modifier.isStatic(field.getModifiers())) return null;
            field.setAccessible(true);
            return field;
        } catch (ReflectiveOperationException | RuntimeException unavailable) { return null; }
    }

    private static AudioTrack innerTrack(JavaAudioDeviceModule module) {
        try {
            if (TRACK_FIELD == null || module == null || module.audioOutput == null
                    || module.audioOutput.getClass() != WebRtcAudioTrack.class) return null;
            Object value = TRACK_FIELD.get(module.audioOutput);
            return value instanceof AudioTrack ? (AudioTrack) value : null;
        } catch (IllegalAccessException | RuntimeException unavailable) { return null; }
    }

    private static final class TrackToken {
        final Observer observer;
        final AudioTrack track;
        TrackToken(Observer observer, AudioTrack track) { this.observer = observer; this.track = track; }
    }

    /** Installed while creating the one shared ADM, before any playout starts. */
    public static final class Observer implements JavaAudioDeviceModule.AudioTrackStateCallback {
        private volatile JavaAudioDeviceModule module;
        private final AtomicReference<TrackToken> playing = new AtomicReference<>();
        private final AtomicLong revision = new AtomicLong();

        public void bind(JavaAudioDeviceModule module) {
            this.module = module;
            Observer previous = ACTIVE.getAndSet(this);
            if (previous != null && previous != this) previous.playing.set(null);
            changed(this, revision.incrementAndGet());
        }

        @Override public void onWebRtcAudioTrackStart() {
            // Capture on the real callback thread. Re-reading after posting to
            // main could bind a successor track to this old callback.
            AudioTrack track = innerTrack(module);
            if (ACTIVE.get() != this) return;
            playing.set(track == null ? null : new TrackToken(this, track));
            changed(this, revision.incrementAndGet());
        }

        @Override public void onWebRtcAudioTrackStop() {
            AudioTrack stopped = innerTrack(module);
            if (ACTIVE.get() != this) return;
            TrackToken before = playing.get();
            if (before != null && before.track == stopped && playing.compareAndSet(before, null)) {
                changed(this, revision.incrementAndGet());
            }
        }
    }

    private static void changed(Observer observer, long revision) {
        MAIN.post(() -> {
            if (ACTIVE.get() != observer || observer.revision.get() != revision) return;
            for (Subscription subscription : SUBSCRIPTIONS) subscription.refresh();
        });
    }

    private boolean shared(Observer observer) {
        try {
            if (observer == null || observer != ACTIVE.get() || observer.module == null) return false;
            JavaAudioDeviceModule expected = observer.module;
            return LiveKitReactNative.INSTANCE.getAudioDeviceModule() == expected
                    && WebRTCModuleOptions.getInstance().audioDeviceModule == expected
                    && ChillywoodAudioModuleAccessor.matches(context, expected);
        } catch (RuntimeException unavailable) { return false; }
    }

    @Override public boolean isAvailable() {
        Observer observer = ACTIVE.get();
        if (TRACK_FIELD == null || !shared(observer) || observer.module.audioOutput == null
                || observer.module.audioOutput.getClass() != WebRtcAudioTrack.class) return false;
        Object token = currentTrack();
        for (Subscription subscription : SUBSCRIPTIONS) {
            if (subscription.probe == this && !subscription.ready(token)) return false;
        }
        return true;
    }

    private boolean current(TrackToken token) {
        if (token == null || !shared(token.observer) || token.observer.playing.get() != token
                || innerTrack(token.observer.module) != token.track) return false;
        try {
            return token.track.getState() == AudioTrack.STATE_INITIALIZED
                    && token.track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING;
        } catch (RuntimeException unavailable) { return false; }
    }

    @Override public Object currentTrack() {
        Observer observer = ACTIVE.get();
        TrackToken token = observer == null ? null : observer.playing.get();
        return current(token) ? token : null;
    }

    @Override public AudioDeviceInfo selectedDevice(Object expectedTrack) {
        if (!isAvailable()) return null;
        Object current = currentTrack();
        if (!(current instanceof TrackToken) || (expectedTrack != null && expectedTrack != current)) return null;
        TrackToken token = (TrackToken) current;
        try {
            AudioDeviceInfo route = token.track.getRoutedDevice();
            // Includes actual factory, options, LiveKit ADM, reflected inner
            // identity and PLAYING checks again after the framework read.
            return route != null && current(token) && currentTrack() == token && isAvailable() ? route : null;
        } catch (RuntimeException unavailable) { return null; }
    }

    @Override public Runnable subscribe(Runnable callback) {
        Subscription subscription = new Subscription(this, callback);
        SUBSCRIPTIONS.add(subscription);
        // The owned coordinator subscribes on main. Complete the first attempt
        // before its acquisition receipt; a failed observer never blocks startup.
        subscription.refresh();
        return subscription::close;
    }

    private static final class Subscription {
        final ChillywoodAudioTrackRoute probe;
        final Runnable callback;
        volatile boolean retired;
        volatile boolean failed;
        volatile Binding binding;
        Subscription(ChillywoodAudioTrackRoute probe, Runnable callback) {
            this.probe = probe;
            this.callback = callback;
        }

        boolean ready(Object token) {
            Binding current = binding;
            return !retired && !failed && (token == null ? current == null
                    : current != null && current.token == token && current.attached);
        }

        void refresh() {
            if (retired) return;
            Object candidate = probe.currentTrack();
            TrackToken token = candidate instanceof TrackToken ? (TrackToken) candidate : null;
            try {
                if (binding != null && (binding.token != token || !binding.attached)) detach();
                if (binding == null && token != null) {
                    Binding next = new Binding(this, token);
                    // Retain the exact listener even if registration throws;
                    // release can retry its removal without touching a successor.
                    binding = next;
                    token.track.addOnRoutingChangedListener(next.listener, MAIN);
                    next.attached = true;
                }
                failed = false;
            } catch (RuntimeException unavailable) {
                // Keep the exact possibly partially registered listener. Neither
                // explicit reads nor events may advertise a route without its
                // observer; a later refresh or End can retry that exact cleanup.
                failed = true;
            }
            try { callback.run(); }
            catch (RuntimeException unavailable) { /* no observer callback can escape */ }
        }

        void detach() {
            Binding before = binding;
            if (before != null) {
                before.token.track.removeOnRoutingChangedListener(before.listener);
                binding = null;
            }
        }

        void close() {
            retired = true;
            detach();
            SUBSCRIPTIONS.remove(this);
        }
    }

    private static final class Binding {
        final TrackToken token;
        final AudioRouting.OnRoutingChangedListener listener;
        volatile boolean attached;
        Binding(Subscription subscription, TrackToken token) {
            this.token = token;
            listener = router -> {
                if (!attached || subscription.retired || subscription.failed
                        || subscription.binding != this || router != token.track
                        || subscription.probe.currentTrack() != token) return;
                try { subscription.callback.run(); }
                catch (RuntimeException unavailable) { /* no stale callback can escape */ }
            };
        }
    }
}
