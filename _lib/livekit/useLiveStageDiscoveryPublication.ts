import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../accountSessionAuthority";
import { useSession } from "../session";
import { markLiveStageRoomConnectedForDiscovery, type LiveDiscoveryPublicationResult } from "./token-contract";

type PublicationState = { status: "idle" | "pending" | "published" | "failed"; message: string; retryable: boolean };
const idle: PublicationState = { status: "idle", message: "Waiting for live connection confirmation.", retryable: false };

// A callback generation (for example an explicitly changed audience) can
// change while the SDK still owns the same connected room. Reconfirm only the
// actual current Room state; the endpoint independently verifies host presence.
export function useLiveStageConnectionPublication({ room, active, retiredRooms, onConnected }: {
  room: { state: unknown };
  active: boolean;
  retiredRooms: ReadonlySet<{ state: unknown }>;
  onConnected?: () => void;
}) {
  const connectionState = room.state;
  useEffect(() => {
    if (active && !retiredRooms.has(room) && room.state === "connected") onConnected?.();
  }, [active, connectionState, onConnected, retiredRooms, room]);
}

export function useLiveStageDiscoveryPublication(options: {
  roomName: string;
  hostUserId: string;
  visibility: "private" | "public" | "circle";
  isHost: boolean;
  active: boolean;
  connectionKey: string;
}) {
  const { authority, authorityStatus } = useSession();
  const { roomName, hostUserId, visibility, isHost, active, connectionKey } = options;
  const lifetime = useMemo(() => ({ authority, authorityStatus, roomName, hostUserId, visibility, isHost, active, connectionKey }),
    [authority, authorityStatus, roomName, hostUserId, visibility, isHost, active, connectionKey]);
  const latest = useRef(lifetime);
  latest.current = lifetime;
  const retired = useRef<object | null>(null);
  const connected = useRef<object | null>(null);
  const run = useRef<{ lifetime: object; controller: AbortController } | null>(null);
  const [saved, setSaved] = useState<{ lifetime: object; state: PublicationState } | null>(null);
  const latestState = useRef(saved);
  const save = useCallback((state: PublicationState) => {
    latestState.current = { lifetime, state };
    setSaved(latestState.current);
  }, [lifetime]);
  const eligible = useCallback(() => latest.current === lifetime && retired.current !== lifetime
    && active && isHost && !!connectionKey && !!roomName && visibility !== "private"
    && authorityStatus === "active" && !!authority && !authority.restoreOnly
    && authority.userId === hostUserId && AppState.currentState === "active",
  [lifetime, active, isHost, connectionKey, roomName, visibility, authorityStatus, authority, hostUserId]);

  const cancel = useCallback(() => {
    if (latest.current !== lifetime) return;
    retired.current = lifetime;
    if (connected.current === lifetime) connected.current = null;
    if (run.current?.lifetime === lifetime) { run.current.controller.abort(); run.current = null; }
  }, [lifetime]);

  useEffect(() => {
    if (latest.current === lifetime && retired.current === lifetime) retired.current = null;
    const unsubscribe = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(authority, next)) cancel();
    });
    const app = AppState.addEventListener("change", next => {
      if (next === "active" || latest.current !== lifetime) return;
      // Background pauses this attempt, not the session's whole lifetime.
      // Foreground still needs an actual connected-room callback before sending.
      if (connected.current === lifetime) connected.current = null;
      if (run.current?.lifetime === lifetime) { run.current.controller.abort(); run.current = null; }
    });
    return () => {
      unsubscribe(); app.remove();
      if (connected.current === lifetime) connected.current = null;
      if (run.current?.lifetime === lifetime) { run.current.controller.abort(); run.current = null; }
      // Retained callbacks from an unmounted screen must be inert even when no
      // replacement render has changed latest.current.
      if (latest.current === lifetime) retired.current = lifetime;
    };
  }, [authority, lifetime, cancel]);

  const begin = useCallback(() => {
    if (!eligible() || connected.current !== lifetime || !authority) return;
    if (run.current?.lifetime === lifetime) return;
    if (run.current) { run.current.controller.abort(); run.current = null; }
    const owned = { lifetime, controller: new AbortController() };
    run.current = owned;
    save({ status: "pending", message: "Confirming your live listing…", retryable: false });
    const finish = (result: LiveDiscoveryPublicationResult) => {
      if (run.current !== owned || !eligible()) return;
      if (result.status === "cancelled") return;
      save(result.status === "published"
        ? { status: "published", message: visibility === "circle" ? "Circle live listing confirmed." : "Live listing confirmed.", retryable: false }
        : { status: "failed", retryable: result.retryable,
          message: result.reason === "session_changed" ? "Live listing not confirmed. Sign in again or reopen this room."
            : result.reason === "not_eligible" ? "This room is not eligible for a live listing. Check its audience or reopen the room."
              : "Live listing not confirmed. Your room may not appear to others yet." });
    };
    void markLiveStageRoomConnectedForDiscovery(roomName, { authority, signal: owned.controller.signal })
      .then(finish, () => finish({ status: "failed", reason: "request_failed", retryable: true }))
      .finally(() => { if (run.current === owned) run.current = null; });
  }, [authority, eligible, lifetime, roomName, save, visibility]);

  const onConnected = useCallback(() => {
    if (!eligible()) return;
    if (connected.current === lifetime) return;
    connected.current = lifetime;
    begin();
  }, [begin, eligible, lifetime]);
  const onDisconnected = useCallback(() => {
    if (latest.current !== lifetime) return;
    if (connected.current === lifetime) connected.current = null;
    if (run.current?.lifetime === lifetime) { run.current.controller.abort(); run.current = null; }
    if (eligible()) save({ status: "failed", message: "Live connection interrupted. Waiting to reconnect.", retryable: false });
  }, [eligible, lifetime, save]);
  const retry = useCallback(() => {
    const current = latestState.current;
    if (current?.lifetime === lifetime && current.state.status === "failed" && current.state.retryable) begin();
  }, [begin, lifetime]);

  const state = saved?.lifetime === lifetime ? saved.state : idle;
  return {
    ...state,
    message: visibility === "private" ? "Private room · not listed in Live." : state.message,
    canRetry: state.status === "failed" && state.retryable && eligible() && connected.current === lifetime,
    onConnected, onDisconnected, retry, cancel,
  };
}
