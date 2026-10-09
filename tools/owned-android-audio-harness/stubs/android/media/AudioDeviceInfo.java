package android.media;

public final class AudioDeviceInfo {
    public static final int TYPE_BUILTIN_EARPIECE = 1;
    public static final int TYPE_BUILTIN_SPEAKER = 2;
    public static final int TYPE_WIRED_HEADSET = 3;
    public static final int TYPE_BLUETOOTH_SCO = 7;
    private final int type;
    public AudioDeviceInfo(int type) { this.type = type; }
    public int getType() { return type; }
}
