package android.media;

import android.os.Handler;

public interface AudioRouting {
    interface OnRoutingChangedListener { void onRoutingChanged(AudioRouting routing); }
    AudioDeviceInfo getRoutedDevice();
    void addOnRoutingChangedListener(OnRoutingChangedListener listener, Handler handler);
    void removeOnRoutingChangedListener(OnRoutingChangedListener listener);
}
