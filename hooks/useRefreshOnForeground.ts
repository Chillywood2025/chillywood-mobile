import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useRefreshOnForeground(refresh: () => void | Promise<void>) {
  const refreshRef = useRef(refresh);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  refreshRef.current = refresh;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const shouldRefresh = nextState === "active" && appStateRef.current !== "active";
      appStateRef.current = nextState;
      if (!shouldRefresh) return;
      void Promise.resolve(refreshRef.current()).catch(() => {});
    });

    return () => subscription.remove();
  }, []);
}
