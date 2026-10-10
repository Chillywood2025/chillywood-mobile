package com.oney.WebRTCModule;

import com.facebook.react.bridge.ReactApplicationContext;
import org.webrtc.audio.AudioDeviceModule;

/** Read the ADM captured by the actual factory, not only its mutable options. */
public final class ChillywoodAudioModuleAccessor {
    private ChillywoodAudioModuleAccessor() {}

    public static boolean matches(ReactApplicationContext context, AudioDeviceModule expected) {
        WebRTCModule module = context.getNativeModule(WebRTCModule.class);
        return module != null && expected != null && module.mAudioDeviceModule == expected;
    }
}
