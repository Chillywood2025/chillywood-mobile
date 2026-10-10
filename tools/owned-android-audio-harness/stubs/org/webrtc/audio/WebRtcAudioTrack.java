package org.webrtc.audio;

import android.media.AudioTrack;

public final class WebRtcAudioTrack {
    // Same exact private name/type as pinned144.7559.01; production reflection
    // must cross this boundary, not a public test-only route getter.
    private AudioTrack audioTrack;
    void setFixtureTrack(AudioTrack track) { audioTrack = track; }
}
