import type { Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import { clearUser, identifyUser, trackEvent } from "./analytics";
import { reportDebugAuth } from "./devDebug";
import { stopActiveMediaSessions } from "./mediaSessionLifecycle";
import { supabase } from "./supabase";

const PASSWORD_RECOVERY_SESSION_STORAGE_KEY = "chillywood.passwordRecoverySession";

type SessionContextValue = {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  isSignedIn: boolean;
  isPasswordRecoverySession: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecoverySession, setIsPasswordRecoverySession] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;

    supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        supabase.auth.startAutoRefresh();
        return;
      }

      supabase.auth.stopAutoRefresh();
    });

    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        const nextSession = data.session ?? null;
        const nextUser = nextSession?.user ?? null;
        const recoveryMarker = await AsyncStorage.getItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY).catch(() => null);
        if (!active) return;

        setSession(nextSession);
        setUser(nextUser);
        setIsPasswordRecoverySession(!!nextSession && recoveryMarker === "active");
        setIsLoading(false);

        if (!nextSession || Platform.OS === "web") return;

        supabase.auth.refreshSession()
          .then(({ data: refreshed }) => {
            if (!active) return;
            const refreshedSession = refreshed.session ?? nextSession;
            setSession(refreshedSession);
            setUser(refreshedSession.user ?? nextUser);
          })
          .catch(() => {
            // keep the cached session state if refresh fails
          });
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setUser(null);
        setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      const nextUser = nextSession?.user ?? null;
      setSession(nextSession);
      setUser(nextUser);
      setIsLoading(false);

      if (event === "PASSWORD_RECOVERY" && nextSession) {
        setIsPasswordRecoverySession(true);
        void AsyncStorage.setItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY, "active").catch(() => null);
      }
      if (event === "SIGNED_OUT" || !nextSession) {
        void stopActiveMediaSessions("sign_out");
        setIsPasswordRecoverySession(false);
        void AsyncStorage.removeItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY).catch(() => null);
      }

      if (event === "SIGNED_IN" && nextUser) {
        trackEvent("auth_sign_in_success", {
          userId: nextUser.id,
        });
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    reportDebugAuth({
      signedIn: !!user,
      sessionExists: !!session,
      userId: user?.id ?? null,
      email: user?.email ?? null,
    });

    if (user) {
      identifyUser({
        id: user.id,
        email: user.email ?? null,
      });
      return;
    }

    clearUser();
  }, [session, user]);

  const value = useMemo<SessionContextValue>(() => ({
    isLoading,
    session,
    user,
    isSignedIn: !!user,
    isPasswordRecoverySession,
  }), [isLoading, isPasswordRecoverySession, session, user]);

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return context;
}

export function useOptionalSession() {
  return useContext(SessionContext);
}
