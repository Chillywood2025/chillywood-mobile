package com.twilio.audioswitch;
public abstract class AudioDevice {
    public static final class BluetoothHeadset extends AudioDevice {}
    public static final class WiredHeadset extends AudioDevice {}
    public static final class Speakerphone extends AudioDevice {}
    public static final class Earpiece extends AudioDevice {}
}
