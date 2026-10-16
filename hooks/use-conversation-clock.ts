import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { CONVERSATION_TIMESTAMP_WEEK_MS, conversationTimestampMillis, type ConversationTimestampValue } from "../_lib/conversationTimestamp";

const listeners = new Set<() => void>();
let revision = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let activation: ReturnType<typeof AppState.addEventListener> | undefined;
const refresh = () => {
  revision += 1;
  listeners.forEach((listener) => listener());
};
const snapshot = () => revision;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Also rerender when only the device timezone/locale changes, even if now is unchanged.
    timer = setInterval(refresh, 60_000);
    activation = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
      activation?.remove();
      activation = undefined;
    }
  };
};

export function useConversationClock(value?: ConversationTimestampValue) {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const now = Date.now();
  const time = conversationTimestampMillis(value);
  useEffect(() => {
    // Wake exactly when a future timestamp becomes current or a recent one reaches seven days.
    const boundary = time > now ? time : time + CONVERSATION_TIMESTAMP_WEEK_MS;
    const delay = boundary - now;
    if (!Number.isFinite(delay) || delay <= 0 || delay > CONVERSATION_TIMESTAMP_WEEK_MS) return;
    const boundaryTimer = setTimeout(refresh, delay);
    return () => clearTimeout(boundaryTimer);
  }, [now, time]);
  return now;
}
