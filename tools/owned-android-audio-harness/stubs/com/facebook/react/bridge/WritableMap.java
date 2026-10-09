package com.facebook.react.bridge;
import java.util.HashMap;
public final class WritableMap extends HashMap<String, Object> {
    public void putString(String key, String value) { put(key, value); }
    public void putBoolean(String key, boolean value) { put(key, value); }
    public void putArray(String key, WritableArray value) { put(key, value); }
    public String getString(String key) { return (String) get(key); }
    public boolean getBoolean(String key) { return (Boolean) get(key); }
    public WritableArray getArray(String key) { return (WritableArray) get(key); }
}
