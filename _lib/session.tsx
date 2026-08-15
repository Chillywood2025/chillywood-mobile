import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import { readAccountAccessStatus } from "./accountAccess";
import { publishAccountSessionAuthoritySnapshot, readCurrentAccountSessionAuthority, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { clearUser, identifyUser, trackEvent } from "./analytics";
import { reportDebugAuth } from "./devDebug";
import { stopActiveMediaSessions } from "./mediaSessionLifecycle";
import { revokePushOwnershipForSession, type PushRevocationReason } from "./notifications";
import { supabase } from "./supabase";

const PASSWORD_RECOVERY_SESSION_STORAGE_KEY = "chillywood.passwordRecoverySession.v2";

export type SessionAuthorityStatus = "loading" | "active" | "restore_only" | "signed_out" | "unknown" | "restricted";

type SessionContextValue = {
  authority: AccountSessionAuthorityBinding | null; authorityStatus: SessionAuthorityStatus;
  isLoading: boolean; session: Session | null; user: User | null;
  isSignedIn: boolean; isPasswordRecoverySession: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const readRecoveryBinding = async () => {
  const raw = await AsyncStorage.getItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AccountSessionAuthorityBinding>;
    if (value.state !== "ACTIVE" || typeof value.restoreOnly !== "boolean") return null;
    if (!String(value.userId ?? "").trim() || !String(value.accountId ?? "").trim()) return null;
    if (!String(value.sessionGeneration ?? "").trim()) return null;
    return value as AccountSessionAuthorityBinding;
  } catch {
    return null;
  }
};

const saveRecoveryBinding = (authority: AccountSessionAuthorityBinding) => AsyncStorage
  .setItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY, JSON.stringify(authority)).catch(() => null);
const clearRecoveryBinding = () => AsyncStorage.removeItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY).catch(() => null);

const revocationReason = (event: AuthChangeEvent, replacement: boolean): PushRevocationReason => {
  if (event === "PASSWORD_RECOVERY") return "recovery_replacement";
  if (replacement) return "account_switch";
  if (event === "SIGNED_OUT") return "sign_out";
  return "auth_loss";
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authority, setAuthority] = useState<AccountSessionAuthorityBinding | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<SessionAuthorityStatus>("loading");
  const [isPasswordRecoverySession, setIsPasswordRecoverySession] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    supabase.auth.startAutoRefresh();
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let sequence = 0;
    let lastAuthority: AccountSessionAuthorityBinding | null = null;
    let lastSession: Session | null = null;
    const cleanupKeys = new Set<string>();

    const detachOperationalOwnership = (binding: AccountSessionAuthorityBinding, reason: PushRevocationReason) => {
      const key = `${binding.userId}:${binding.accountId}:${binding.sessionGeneration}:${reason}`;
      if (cleanupKeys.has(key)) return;
      if (cleanupKeys.size >= 64) cleanupKeys.clear();
      cleanupKeys.add(key);
      void stopActiveMediaSessions("sign_out");
      void revokePushOwnershipForSession({ ...binding, reason }).catch(() => null);
    };

    const clearRenderedAuthority = (status: SessionAuthorityStatus) => {
      publishAccountSessionAuthoritySnapshot(null);
      setAuthority(null); setSession(null); setUser(null); setIsPasswordRecoverySession(false);
      setAuthorityStatus(status);
    };

    const reconcile = (event: AuthChangeEvent, candidate: Session | null) => {
      const operation = ++sequence;
      const priorAuthority = lastAuthority;
      const priorUserId = String(lastSession?.user?.id ?? priorAuthority?.userId ?? "").trim();
      const candidateUserId = String(candidate?.user?.id ?? "").trim();
      const knownReplacement = !!priorAuthority && !!candidateUserId && priorUserId !== candidateUserId;
      clearRenderedAuthority(candidate ? "loading" : "signed_out");
      lastSession = candidate;

      if (knownReplacement && priorAuthority) {
        detachOperationalOwnership(priorAuthority, "account_switch");
        lastAuthority = null;
      }
      if (!candidate || !candidateUserId) {
        if (lastAuthority) detachOperationalOwnership(lastAuthority, revocationReason(event, false));
        lastAuthority = null;
        void clearRecoveryBinding();
        return;
      }

      setTimeout(() => {
        void (async () => {
          const [nextAuthority, access, currentAuth] = await Promise.all([
            readCurrentAccountSessionAuthority(),
            readAccountAccessStatus(candidateUserId).catch(() => null),
            supabase.auth.getSession().catch(() => ({ data: { session: null } })),
          ]);
          if (!mounted || operation !== sequence) return;
          const currentSession = currentAuth.data.session;
          const candidateStillCurrent = currentSession?.access_token === candidate.access_token
            && currentSession?.user?.id === candidateUserId;
          const exactAuthority = !!nextAuthority && nextAuthority.userId === candidateUserId;
          if (!candidateStillCurrent || !access) { setAuthorityStatus("unknown"); return; }
          if (access.authSuspended || (access.restricted && !access.scheduledDeletion)) {
            const cleanupAuthority = exactAuthority ? nextAuthority : priorAuthority;
            if (cleanupAuthority) detachOperationalOwnership(cleanupAuthority, "auth_invalidation");
            lastAuthority = null;
            setAuthorityStatus("restricted");
            void clearRecoveryBinding();
            void supabase.auth.signOut().catch(() => null);
            return;
          }
          if (!exactAuthority) {
            if (priorAuthority) detachOperationalOwnership(priorAuthority, "auth_invalidation");
            lastAuthority = null; setAuthorityStatus("unknown"); return;
          }
          if (access.scheduledDeletion) {
            if (nextAuthority?.restoreOnly !== true) { setAuthorityStatus("unknown"); return; }
            detachOperationalOwnership(nextAuthority, "account_deletion");
            lastAuthority = nextAuthority;
            lastSession = currentSession;
            setAuthority(nextAuthority); setSession(currentSession); setUser(null);
            setAuthorityStatus("restore_only");
            void clearRecoveryBinding();
            return;
          }
          if (nextAuthority?.restoreOnly === true) { setAuthorityStatus("unknown"); return; }
          if (priorAuthority && (
            event === "PASSWORD_RECOVERY"
            || !sameAccountSessionAuthority(priorAuthority, nextAuthority)
          )) {
            detachOperationalOwnership(priorAuthority, revocationReason(event, true));
          }
          lastAuthority = nextAuthority;
          lastSession = currentSession;
          publishAccountSessionAuthoritySnapshot(nextAuthority);
          setAuthority(nextAuthority); setSession(currentSession); setUser(currentSession.user);
          setAuthorityStatus("active");

          const storedRecovery = await readRecoveryBinding();
          if (!mounted || operation !== sequence) return;
          const recovery = event === "PASSWORD_RECOVERY"
            || (event === "INITIAL_SESSION" && sameAccountSessionAuthority(storedRecovery, nextAuthority));
          setIsPasswordRecoverySession(recovery);
          if (recovery) void saveRecoveryBinding(nextAuthority);
          else void clearRecoveryBinding();
          if (event === "SIGNED_IN") trackEvent("auth_sign_in_success", { source: "session_authority" });
        })().catch(() => {
          if (mounted && operation === sequence) setAuthorityStatus("unknown");
        });
      }, 0);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) reconcile(event, nextSession);
    });
    void supabase.auth.getSession()
      .then(({ data }) => { if (mounted) reconcile("INITIAL_SESSION", data.session ?? null); })
      .catch(() => { if (mounted) clearRenderedAuthority("unknown"); });

    return () => {
      mounted = false;
      sequence += 1;
      listener.subscription.unsubscribe();
      publishAccountSessionAuthoritySnapshot(null);
    };
  }, []);

  useEffect(() => {
    reportDebugAuth({ signedIn: authorityStatus === "active", sessionExists: !!session, userId: null, email: null });
    if (user && authorityStatus === "active") identifyUser({ id: user.id, email: user.email ?? null });
    else clearUser();
  }, [authorityStatus, session, user]);

  const value = useMemo<SessionContextValue>(() => ({
    authority, authorityStatus,
    isLoading: authorityStatus === "loading" || authorityStatus === "unknown",
    session, user,
    isSignedIn: authorityStatus === "active" && !!user && !!authority,
    isPasswordRecoverySession,
  }), [authority, authorityStatus, isPasswordRecoverySession, session, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider.");
  return context;
}

export function useOptionalSession() {
  return useContext(SessionContext);
}
