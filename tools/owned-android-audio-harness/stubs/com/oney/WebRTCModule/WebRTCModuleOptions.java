package com.oney.WebRTCModule;

import org.webrtc.audio.AudioDeviceModule;

public final class WebRTCModuleOptions {
    private static final WebRTCModuleOptions INSTANCE = new WebRTCModuleOptions();
    public AudioDeviceModule audioDeviceModule;
    public static WebRTCModuleOptions getInstance() { return INSTANCE; }
}
