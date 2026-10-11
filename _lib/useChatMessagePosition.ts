import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
import { AppState, type LayoutChangeEvent, type ScrollView } from "react-native";

type MessagePositionInput = {
  entryKey: string;
  ready: boolean;
  messageIds: string[];
  targetMessageId: string | null;
};
type PositionRequest = {
  entryKey: string;
  consumed: boolean;
  viewportHeight: number;
  contentHeight: number;
  positions: Map<string, { y: number; height: number }>;
};

/** One initial layout action per owned entry, never per realtime refresh. */
export function useChatMessagePosition(input: MessagePositionInput) {
  const scrollRef = useRef<ScrollView | null>(null);
  const focused = useIsFocused();
  const wasFocused = useRef(focused);
  const current = useRef({ ...input, focused });
  current.current = { ...input, focused };
  const request = useRef<PositionRequest | null>(null);
  const { entryKey } = input;

  const position = useCallback(() => {
    const state = request.current;
    const now = current.current;
    if (!state || state.entryKey !== entryKey || now.entryKey !== entryKey
      || state.consumed || !now.ready || !now.focused || AppState.currentState !== "active") return;
    if (!now.messageIds.length) { state.consumed = true; return; }
    const targetExists = !!now.targetMessageId && now.messageIds.includes(now.targetMessageId);
    const id = targetExists ? now.targetMessageId! : now.messageIds[now.messageIds.length - 1];
    const rect = state.positions.get(id);
    if (!rect || !scrollRef.current || state.viewportHeight <= 0
      || state.contentHeight < rect.y + rect.height) return;
    state.consumed = true;
    scrollRef.current.scrollTo({ animated: false, y: Math.max(0,
      targetExists ? rect.y : rect.y + rect.height - state.viewportHeight) });
  }, [entryKey]);

  useLayoutEffect(() => {
    request.current = { entryKey, consumed: false, viewportHeight: 0, contentHeight: 0, positions: new Map() };
    return () => { if (request.current?.entryKey === entryKey) request.current = null; };
  }, [entryKey]);
  useLayoutEffect(() => { position(); }, [position, input.ready, input.messageIds, focused]);
  useEffect(() => {
    if (!focused && wasFocused.current && request.current?.entryKey === entryKey) request.current.consumed = true;
    wasFocused.current = focused;
    let previousAppState = AppState.currentState;
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active" && previousAppState === "active" && request.current?.entryKey === entryKey) request.current.consumed = true;
      previousAppState = state;
      if (state === "active") position();
    });
    return () => listener.remove();
  }, [entryKey, focused, position]);

  // The screen keys its native list by the completed owned read's entryKey.
  // New targets obtain layout after that read, even when old rows had already
  // rendered while it was pending. Loading remounts also discard old bounds.
  const attachScroll = useCallback((node: ScrollView | null) => {
    if (current.current.entryKey !== entryKey) return;
    if (node !== scrollRef.current && request.current?.entryKey === entryKey) {
      request.current.viewportHeight = 0;
      request.current.contentHeight = 0;
      request.current.positions.clear();
    }
    scrollRef.current = node;
  }, [entryKey]);

  const own = () => request.current?.entryKey === entryKey && current.current.entryKey === entryKey
    ? request.current : null;
  return {
    scrollRef: attachScroll,
    onLayout: (event: LayoutChangeEvent) => {
      const state = own();
      if (state) state.viewportHeight = event.nativeEvent.layout.height;
      position();
    },
    onContentSizeChange: (_width: number, height: number) => {
      const state = own();
      if (state) state.contentHeight = height;
      position();
    },
    onScrollBeginDrag: () => { const state = own(); if (state) state.consumed = true; },
    onMessageLayout: (id: string, event: LayoutChangeEvent) => {
      const state = own();
      if (state && current.current.ready && current.current.messageIds.includes(id)) {
        const { y, height } = event.nativeEvent.layout;
        state.positions.set(id, { y, height });
      }
      position();
    },
  };
}
