package com.twilio.audioswitch;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayList;
import java.util.List;
import kotlin.Unit;
import kotlin.jvm.functions.Function2;

/** Scanner and cached preference are deliberately independent from OS routing. */
public final class AudioSwitch {
    public static final List<AudioSwitch> instances = new ArrayList<>();
    public static final List<AudioDevice> scanner = new ArrayList<>();
    public static boolean throwStart, throwActivate, throwStop;
    public static boolean routeOnActivate = true;
    public static int constructed, starts, activations, stops, selections, configurations;
    public static AudioDevice initialCached;
    public final List<Class<? extends AudioDevice>> preferences;
    public List<Class<? extends AudioDevice>> preferencesAtActivation;
    public AudioDevice cached;
    public boolean stopped;
    private Function2<? super List<? extends AudioDevice>, ? super AudioDevice, Unit> changeListener;
    private final AudioManager system;
    public AudioSwitch(Context context, boolean logging, AudioManager.OnAudioFocusChangeListener listener,
                       List<Class<? extends AudioDevice>> preferred) {
        Handler.requireMain(); ++constructed; instances.add(this);
        preferences = new ArrayList<>(preferred); cached = initialCached; system = context.audio;
    }
    public static void reset() {
        instances.clear(); scanner.clear(); initialCached = null;
        throwStart = false; throwActivate = false; throwStop = false;
        routeOnActivate = true;
        constructed = starts = activations = stops = selections = configurations = 0;
        scanner.add(new AudioDevice.Speakerphone()); scanner.add(new AudioDevice.Earpiece());
    }
    public void start(Function2<? super List<? extends AudioDevice>, ? super AudioDevice, Unit> callback) {
        Handler.requireMain(); ++starts;
        if (throwStart) throw new IllegalStateException("controlled scanner start failure");
        changeListener = callback;
        callback.invoke(new ArrayList<>(scanner), cached);
    }
    public void queueScannerChange() {
        Function2<? super List<? extends AudioDevice>, ? super AudioDevice, Unit> callback = changeListener;
        List<AudioDevice> observed = new ArrayList<>(scanner);
        AudioDevice selected = cached;
        // A callback already dispatched by the scanner can outlive stop().
        new Handler(Looper.getMainLooper()).post(() -> callback.invoke(observed, selected));
    }
    public void activate() {
        Handler.requireMain(); ++activations;
        preferencesAtActivation = new ArrayList<>(preferences);
        if (throwActivate) throw new IllegalStateException("controlled activation failure");
        if (cached == null) {
            for (Class<? extends AudioDevice> preferred : preferences) {
                for (AudioDevice device : scanner) {
                    if (preferred == device.getClass()) { cached = device; break; }
                }
                if (cached != null) break;
            }
        }
        if (routeOnActivate && cached != null) {
            int type = cached instanceof AudioDevice.Speakerphone ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                : cached instanceof AudioDevice.Earpiece ? AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                : cached instanceof AudioDevice.WiredHeadset ? AudioDeviceInfo.TYPE_WIRED_HEADSET
                : AudioDeviceInfo.TYPE_BLUETOOTH_SCO;
            for (AudioDeviceInfo device : system.available) if (device.getType() == type) system.selected = device;
        }
    }
    public void stop() {
        Handler.requireMain(); ++stops; stopped = true;
        if (throwStop) throw new IllegalStateException("controlled stop failure");
    }
    public AudioDevice getSelectedAudioDevice() { Handler.requireMain(); return cached; }
    public List<AudioDevice> getAvailableAudioDevices() { Handler.requireMain(); return new ArrayList<>(scanner); }
    public void selectDevice(AudioDevice device) {
        Handler.requireMain(); ++selections;
        // Even a matching cached route does not ensure the framework selected it.
        if (cached != null && cached.getClass() == device.getClass()) return;
        cached = device;
    }
    private void configure() { Handler.requireMain(); ++configurations; }
    public void setManageAudioFocus(boolean value) { configure(); }
    public void setFocusMode(int value) { configure(); }
    public void setAudioMode(int value) { configure(); }
    public void setAudioStreamType(int value) { configure(); }
    public void setAudioAttributeContentType(int value) { configure(); }
    public void setAudioAttributeUsageType(int value) { configure(); }
    public void setForceHandleAudioRouting(boolean value) { configure(); }
}
