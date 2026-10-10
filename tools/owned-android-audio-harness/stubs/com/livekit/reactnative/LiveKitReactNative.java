package com.livekit.reactnative;

import org.webrtc.audio.JavaAudioDeviceModule;

public final class LiveKitReactNative {
    public static final LiveKitReactNative INSTANCE = new LiveKitReactNative();
    private JavaAudioDeviceModule adm;
    public JavaAudioDeviceModule getAudioDeviceModule() {
        if (adm == null) throw new IllegalStateException("ADM unavailable");
        return adm;
    }
    public void setFixtureAdm(JavaAudioDeviceModule value) { adm = value; }
}
