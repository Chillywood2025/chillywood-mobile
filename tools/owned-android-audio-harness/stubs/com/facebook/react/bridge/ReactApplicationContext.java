package com.facebook.react.bridge;

import android.content.Context;
import android.media.AudioManager;
import java.util.HashMap;
import java.util.Map;

public final class ReactApplicationContext extends Context {
    private final Map<Class<?>, Object> modules = new HashMap<>();
    public ReactApplicationContext(AudioManager audio) { super(audio); }
    public <T> T getNativeModule(Class<T> type) { return type.cast(modules.get(type)); }
    public <T> void setNativeModule(Class<T> type, T value) { modules.put(type, value); }
}
