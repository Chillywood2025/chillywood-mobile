package android.media;

import android.os.Handler;
import java.util.ArrayList;
import java.util.List;

/** Actual playback route is independent of every routing request/cache. */
public final class AudioTrack implements AudioRouting {
    public static final int STATE_UNINITIALIZED = 0, STATE_INITIALIZED = 1;
    public static final int PLAYSTATE_STOPPED = 1, PLAYSTATE_PAUSED = 2, PLAYSTATE_PLAYING = 3;
    public int state = STATE_INITIALIZED, playState = PLAYSTATE_PLAYING;
    public AudioDeviceInfo routedDevice;
    public boolean throwOnRead, throwOnAdd, throwAfterAdd, throwOnRemove;
    public int reads, adds, removes, releaseCalls, playCalls, stopCalls;
    public Runnable duringRead;
    private record Registration(OnRoutingChangedListener listener, Handler handler) {}
    private final List<Registration> listeners = new ArrayList<>();
    public AudioTrack(AudioDeviceInfo routedDevice) { this.routedDevice = routedDevice; }
    public int getState() { return state; }
    public int getPlayState() { return playState; }
    @Override public AudioDeviceInfo getRoutedDevice() {
        ++reads;
        if (throwOnRead) throw new IllegalStateException("controlled playback route read failure");
        AudioDeviceInfo result = state == STATE_INITIALIZED && playState == PLAYSTATE_PLAYING ? routedDevice : null;
        Runnable callback = duringRead; duringRead = null; if (callback != null) callback.run();
        return result;
    }
    @Override public void addOnRoutingChangedListener(OnRoutingChangedListener listener, Handler handler) {
        Handler.requireMain(); ++adds;
        if (throwOnAdd) throw new IllegalStateException("controlled track listener registration failure");
        listeners.add(new Registration(listener, handler));
        if (throwAfterAdd) throw new IllegalStateException("controlled partial track listener registration failure");
    }
    @Override public void removeOnRoutingChangedListener(OnRoutingChangedListener listener) {
        Handler.requireMain(); ++removes;
        if (throwOnRemove) throw new IllegalStateException("controlled track listener removal failure");
        listeners.removeIf(registration -> registration.listener == listener);
    }
    public int listenerCount() { return listeners.size(); }
    public void emitRouteChanged() {
        for (Registration registration : new ArrayList<>(listeners)) {
            registration.handler.post(() -> registration.listener.onRoutingChanged(this));
        }
    }
    public void release() { ++releaseCalls; state = STATE_UNINITIALIZED; playState = PLAYSTATE_STOPPED; }
    public void play() { ++playCalls; playState = PLAYSTATE_PLAYING; }
    public void stop() { ++stopCalls; playState = PLAYSTATE_STOPPED; }
}
