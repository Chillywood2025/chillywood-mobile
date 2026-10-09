package android.media;

import android.os.Build;
import android.os.Handler;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

/** Framework boundary: request acceptance and selected output are independent. */
public final class AudioManager {
    public static final int AUDIOFOCUS_GAIN = 1;
    public static final int MODE_IN_COMMUNICATION = 3;
    public static final int STREAM_VOICE_CALL = 0;
    public interface OnAudioFocusChangeListener { void onAudioFocusChange(int change); }
    public interface OnCommunicationDeviceChangedListener { void onCommunicationDeviceChanged(AudioDeviceInfo device); }
    private record Registration(Executor executor, OnCommunicationDeviceChangedListener listener) {}
    private final List<Registration> listeners = new ArrayList<>();
    public final List<AudioDeviceInfo> available = new ArrayList<>();
    public AudioDeviceInfo selected;
    public boolean setterAccepted = true;
    public boolean applySetter = true;
    public boolean throwOnRead;
    public boolean throwOnClear, throwOnRemoveListener;
    public int readCalls, availableCalls, setCalls, clearCalls, speakerCalls, microphoneCalls;
    public int addedListeners, removedListeners;
    public final List<Integer> requests = new ArrayList<>();
    private void api31() {
        Handler.requireMain();
        if (Build.VERSION.SDK_INT < 31) throw new AssertionError("API31 invoked below Android 12");
    }
    public List<AudioDeviceInfo> getAvailableCommunicationDevices() {
        api31(); ++availableCalls;
        return new ArrayList<>(available);
    }
    public AudioDeviceInfo getCommunicationDevice() {
        api31(); ++readCalls;
        if (throwOnRead) throw new IllegalStateException("controlled framework read failure");
        return selected;
    }
    public boolean setCommunicationDevice(AudioDeviceInfo device) {
        api31(); ++setCalls; requests.add(device.getType());
        if (!available.contains(device)) return false;
        if (setterAccepted && applySetter) selected = device;
        return setterAccepted;
    }
    public void clearCommunicationDevice() {
        api31(); ++clearCalls;
        if (throwOnClear) throw new IllegalStateException("controlled route clear failure");
        selected = null;
    }
    public void addOnCommunicationDeviceChangedListener(Executor executor, OnCommunicationDeviceChangedListener listener) {
        api31(); ++addedListeners; listeners.add(new Registration(executor, listener));
    }
    public void removeOnCommunicationDeviceChangedListener(OnCommunicationDeviceChangedListener listener) {
        api31(); ++removedListeners;
        if (throwOnRemoveListener) throw new IllegalStateException("controlled listener removal failure");
        listeners.removeIf(registration -> registration.listener == listener);
    }
    public void emitRouteChanged() {
        AudioDeviceInfo device = selected;
        for (Registration registration : new ArrayList<>(listeners)) {
            registration.executor.execute(() -> registration.listener.onCommunicationDeviceChanged(device));
        }
    }
    public int registeredListenerCount() { return listeners.size(); }
    public void setSpeakerphoneOn(boolean enabled) { Handler.requireMain(); ++speakerCalls; }
    public void setMicrophoneMute(boolean muted) { ++microphoneCalls; }
}
