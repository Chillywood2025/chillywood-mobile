package org.webrtc.audio;

import android.media.AudioTrack;

public final class JavaAudioDeviceModule implements AudioDeviceModule {
    public interface AudioTrackStateCallback {
        void onWebRtcAudioTrackStart();
        void onWebRtcAudioTrackStop();
    }
    public final WebRtcAudioTrack audioOutput = new WebRtcAudioTrack();
    public int releases;
    public void setFixtureTrack(AudioTrack track) { audioOutput.setFixtureTrack(track); }
    @Override public void release() { ++releases; }
}
