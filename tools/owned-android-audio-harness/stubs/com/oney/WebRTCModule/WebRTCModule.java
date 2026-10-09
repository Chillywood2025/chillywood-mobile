package com.oney.WebRTCModule;

import org.webrtc.audio.AudioDeviceModule;

public final class WebRTCModule {
    // Actual pinned WebRTCModule stores the ADM used by PeerConnectionFactory.
    AudioDeviceModule mAudioDeviceModule;
    public WebRTCModule(AudioDeviceModule adm) { mAudioDeviceModule = adm; }
    public void replaceFixtureAdm(AudioDeviceModule adm) { mAudioDeviceModule = adm; }
}
