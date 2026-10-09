package com.facebook.react.bridge;
import java.util.ArrayList;
public final class WritableArray extends ArrayList<String> {
    public void pushString(String value) { add(value); }
    public String getString(int index) { return get(index); }
}
