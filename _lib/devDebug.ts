import AsyncStorage from "@react-native-async-storage/async-storage";

export type DebugQueryState = {
  name?: string;
  status?: "idle" | "loading" | "success" | "error";
  error?: string | null;
  at?: number;
};

export type DebugState = {
  app: {
    route?: string;
    params?: Record<string, unknown>;
    titleId?: string;
    partyId?: string;
  };
  auth: {
    signedIn?: boolean;
    sessionExists?: boolean;
    userId?: string | null;
    email?: string | null;
  };
  player: {
    titleId?: string;
    loading?: boolean;
    hasTitle?: boolean;
    hasVideoUrl?: boolean;
    positionMillis?: number;
    durationMillis?: number;
    isPlaying?: boolean;
    playbackError?: string | null;
  };
  home: {
    heroTitleId?: string;
    continueWatchingCount?: number;
    myListCount?: number;
    trendingCount?: number;
    topPicksCount?: number;
  };
  party: {
    roomId?: string;
    role?: "host" | "viewer" | null;
    realtimeState?: string;
    participantCount?: number;
    lastSyncAt?: number;
    roomUpdatedAt?: string;
    fallbackPollActive?: boolean;
  };
  query: DebugQueryState;
  lastError?: string | null;
};

const DEV_DEBUG_TOGGLE_KEY = "@chillywood/dev-debug-enabled";

const state: DebugState = {
  app: {},
  auth: {},
  player: {},
  home: {},
  party: {},
  query: { status: "idle" },
  lastError: null,
};

let enabledInDev = false;
const listeners = new Set<(snapshot: DebugState) => void>();

function emit() {
  const snapshot = getDebugSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function patch<K extends keyof DebugState>(key: K, value: Partial<DebugState[K]>) {
  Object.assign(state[key] as object, value);
  emit();
}

export function subscribeDebugState(listener: (snapshot: DebugState) => void) {
  listeners.add(listener);
  listener(getDebugSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getDebugSnapshot(): DebugState {
  return {
    app: { ...state.app },
    auth: { ...state.auth },
    player: { ...state.player },
    home: { ...state.home },
    party: { ...state.party },
    query: { ...state.query },
    lastError: state.lastError,
  };
}

export async function hydrateDevDebugEnabled() {
  if (!__DEV__) return false;
  try {
    const raw = await AsyncStorage.getItem(DEV_DEBUG_TOGGLE_KEY);
    enabledInDev = raw === "1";
    return enabledInDev;
  } catch {
    enabledInDev = false;
    return false;
  }
}

export async function setDevDebugEnabled(enabled: boolean) {
  if (!__DEV__) return;
  enabledInDev = enabled;
  try {
    await AsyncStorage.setItem(DEV_DEBUG_TOGGLE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  emit();
}

export function isDevDebugEnabled() {
  return __DEV__ && enabledInDev;
}

export function reportDebugRoute(route: string, params?: Record<string, unknown>) {
  if (!__DEV__) return;
  patch("app", {
    route,
    params,
    titleId: typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? String(params?.id[0] ?? "") : undefined,
    partyId:
      typeof params?.partyId === "string"
        ? params.partyId
        : typeof params?.party_id === "string"
          ? params.party_id
          : Array.isArray(params?.partyId)
            ? String(params?.partyId[0] ?? "")
            : undefined,
  });
}

export function reportDebugAuth(auth: Partial<DebugState["auth"]>) {
  if (!__DEV__) return;
  patch("auth", auth);
}

export function reportDebugPlayer(player: Partial<DebugState["player"]>) {
  if (!__DEV__) return;
  patch("player", player);
}

export function reportDebugHome(home: Partial<DebugState["home"]>) {
  if (!__DEV__) return;
  patch("home", home);
}

export function reportDebugParty(party: Partial<DebugState["party"]>) {
  if (!__DEV__) return;
  patch("party", party);
}

export function reportDebugQuery(query: Partial<DebugQueryState>) {
  if (!__DEV__) return;
  patch("query", { ...query, at: Date.now() });
}

export function reportDebugError(error: string | null | undefined) {
  if (!__DEV__) return;
  state.lastError = error ?? null;
  emit();
}
