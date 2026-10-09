package android.content;

import android.media.AudioManager;

public class Context {
    public static final String AUDIO_SERVICE = "audio";
    public final AudioManager audio;
    public Context(AudioManager audio) { this.audio = audio; }
    public Object getSystemService(String service) { return audio; }
}
