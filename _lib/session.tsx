import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import { readAccountAccessStatus } from "./accountAccess";
import { clearExactLocalAuthSession, parseAccountSessionAuthorityReadback, publishAccountSessionAuthoritySnapshot, readCurrentAccountSessionAuthority, recoverySessionIsQuarantined, sameAccountSessionAuthority, type AccountSessionAuthorityBinding, type LockedLocalAuthClient } from "./accountSessionAuthority";
import { clearUser, identifyUser, trackEvent } from "./analytics";
import { reportDebugAuth } from "./devDebug";
import { stopActiveMediaSessions } from "./mediaSessionLifecycle";
import { revokePushOwnershipForSession, type PushRevocationReason } from "./notifications";
import { syncRevenueCatCustomerIdentity } from "./revenuecat";
import { supabase } from "./supabase";

const PASSWORD_RECOVERY_SESSION_STORAGE_KEY = "chillywood.passwordRecoverySession.v2";
const PENDING_RECOVERY = "PENDING_RECOVERY" as const;

export type SessionAuthorityStatus = "loading" | "active" | "recovery_only" | "restore_only" | "signed_out" | "unknown" | "restricted";

type SessionContextValue = {
  authority: AccountSessionAuthorityBinding | null; authorityStatus: SessionAuthorityStatus;
  isLoading: boolean; session: Session | null; user: User | null;
  isSignedIn: boolean; isPasswordRecoverySession: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

let verifiedRecoveryBinding: AccountSessionAuthorityBinding | null = null;
let recoveryQuarantineIntent = false;
const readRecoveryBinding = async () => { try {
  const raw = await AsyncStorage.getItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY);
  if (raw === null) return null;
  if (raw === PENDING_RECOVERY) return PENDING_RECOVERY;
  const value = JSON.parse(raw);
  return value && typeof value === "object" && !Array.isArray(value) ? parseAccountSessionAuthorityReadback({ ...value, authoritative: true }) ?? PENDING_RECOVERY : PENDING_RECOVERY;
} catch { return PENDING_RECOVERY; } };
const saveRecoveryBinding = async (authority: AccountSessionAuthorityBinding) => { verifiedRecoveryBinding = authority; try {
  await AsyncStorage.setItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY, JSON.stringify(authority)); return true;
} catch { return false; } };
const clearRecoveryBinding = async () => { try { await AsyncStorage.removeItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY); verifiedRecoveryBinding = null; recoveryQuarantineIntent = false; return true;
} catch { return false; } };
export const beginPasswordRecoverySessionQuarantine = async () => { recoveryQuarantineIntent = true; try { await AsyncStorage.setItem(PASSWORD_RECOVERY_SESSION_STORAGE_KEY, PENDING_RECOVERY); return true; } catch { recoveryQuarantineIntent = false; return false; } };
export const cancelPasswordRecoverySessionQuarantine = clearRecoveryBinding;

export async function persistVerifiedPasswordRecoveryBinding(authority: AccountSessionAuthorityBinding) {
  if (!sameAccountSessionAuthority(authority, await readCurrentAccountSessionAuthority())) return false;
  const saved = await saveRecoveryBinding(authority); if (saved) recoveryQuarantineIntent = false; return saved;
}
export async function clearQuarantinedPasswordRecoverySession(allowPending = false) {
  const proof = verifiedRecoveryBinding ?? await readRecoveryBinding();
  const result = await supabase.auth.getSession().catch(() => null); if (!result) return false;
  const { data } = result;
  if (!data.session) return clearRecoveryBinding();
  const authority = await readCurrentAccountSessionAuthority(); if (proof === null) return clearRecoveryBinding(); const expected = proof === PENDING_RECOVERY ? (allowPending ? authority : null) : proof;
  if (!expected || !sameAccountSessionAuthority(expected, authority) || data.session.user.id !== expected.userId) return false;
  const cleared = await clearExactLocalAuthSession(supabase.auth as unknown as LockedLocalAuthClient, expected.userId, data.session.access_token).catch(() => false);
  return cleared ? clearRecoveryBinding() : false;
}

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
    const cleanupKeyOrder: string[] = [];

    const forgetCleanupKey = (key: string) => {
      cleanupKeys.delete(key);
      const index = cleanupKeyOrder.indexOf(key);
      if (index >= 0) cleanupKeyOrder.splice(index, 1);
    };

    const detachOperationalOwnership = (binding: AccountSessionAuthorityBinding, reason: PushRevocationReason) => {
      const key = `${binding.userId}:${binding.accountId}:${binding.sessionGeneration}`;
      if (cleanupKeys.has(key)) return;
      if (cleanupKeys.size >= 64) forgetCleanupKey(cleanupKeyOrder[0]);
      cleanupKeys.add(key);
      cleanupKeyOrder.push(key);
      void stopActiveMediaSessions("sign_out");
      void revokePushOwnershipForSession({ ...binding, reason }).then((result) => {
        if (result.status === "error") forgetCleanupKey(key);
      }, () => forgetCleanupKey(key));
    };

    const clearRenderedAuthority = (status: SessionAuthorityStatus) => {
      publishAccountSessionAuthoritySnapshot(null);
      setAuthority(null); setSession(null); setUser(null); setIsPasswordRecoverySession(false);
      setAuthorityStatus(status);
    };

    const reconcile = (event: AuthChangeEvent, candidate: Session | null, recoveryIntent = false) => {
      const operation = ++sequence;
      const priorAuthority = lastAuthority;
      const priorUserId = String(lastSession?.user?.id ?? priorAuthority?.userId ?? "").trim();
      const candidateUserId = String(candidate?.user?.id ?? "").trim();
      const knownReplacement = !!priorAuthority && !!candidateUserId && priorUserId !== candidateUserId;
      const sameUserRevalidation = !!candidate
        && !!priorAuthority
        && priorUserId === candidateUserId
        && priorAuthority.userId === candidateUserId
        && event !== "PASSWORD_RECOVERY"
        && event !== "SIGNED_OUT";
      if (sameUserRevalidation) {
        lastSession = candidate;
        setSession(candidate);
        setUser(candidate.user);
      } else {
        clearRenderedAuthority(candidate ? "loading" : "signed_out");
        lastSession = candidate;
      }

      if (knownReplacement && priorAuthority) {
        detachOperationalOwnership(priorAuthority, "account_switch");
        lastAuthority = null;
      }
      if (!candidate || !candidateUserId) {
        if (lastAuthority) detachOperationalOwnership(lastAuthority, revocationReason(event, false));
        lastAuthority = null;
        void clearRecoveryBinding();
        if (event === "SIGNED_OUT") void syncRevenueCatCustomerIdentity(null).catch(() => null);
        return;
      }

      setTimeout(() => {
        void (async () => {
          const [nextAuthority, access, currentAuth, storedRecoveryBinding] = await Promise.all([
            readCurrentAccountSessionAuthority(),
            readAccountAccessStatus(candidateUserId).catch(() => null),
            supabase.auth.getSession().catch(() => ({ data: { session: null } })),
            readRecoveryBinding(),
          ]);
          if (!mounted || operation !== sequence) return;
          const currentSession = currentAuth.data.session;
          const candidateStillCurrent = currentSession?.access_token === candidate.access_token
            && currentSession?.user?.id === candidateUserId;
          const exactAuthority = !!nextAuthority && nextAuthority.userId === candidateUserId;
          if (!candidateStillCurrent || !access) { clearRenderedAuthority("unknown"); return; }
          if (access.authSuspended || (access.restricted && !access.scheduledDeletion)) {
            const cleanupAuthority = exactAuthority ? nextAuthority : priorAuthority;
            if (cleanupAuthority) detachOperationalOwnership(cleanupAuthority, "auth_invalidation");
            lastAuthority = null;
            clearRenderedAuthority("restricted");
            void clearRecoveryBinding();
            void supabase.auth.signOut().catch(() => null);
            return;
          }
          if (!exactAuthority) {
            if (priorAuthority) detachOperationalOwnership(priorAuthority, "auth_invalidation");
            lastAuthority = null; clearRenderedAuthority("unknown"); return;
          }
          if (access.scheduledDeletion) {
            if (nextAuthority?.restoreOnly !== true) { clearRenderedAuthority("unknown"); return; }
            detachOperationalOwnership(nextAuthority, "account_deletion");
            lastAuthority = nextAuthority;
            lastSession = currentSession;
            setAuthority(nextAuthority); setSession(currentSession); setUser(null);
            setAuthorityStatus("restore_only");
            void clearRecoveryBinding();
            return;
          }
          if (nextAuthority?.restoreOnly === true) { clearRenderedAuthority("unknown"); return; }
          const recovery = recoverySessionIsQuarantined(event, nextAuthority,
            verifiedRecoveryBinding, storedRecoveryBinding, recoveryIntent ? PENDING_RECOVERY : null);
          if (priorAuthority && (recovery || !sameAccountSessionAuthority(priorAuthority, nextAuthority))) {
            detachOperationalOwnership(priorAuthority, revocationReason(event, true));
          }
          lastAuthority = nextAuthority;
          lastSession = currentSession;
          if (recovery) {
            publishAccountSessionAuthoritySnapshot(null);
            setAuthority(null); setSession(null); setUser(null); setIsPasswordRecoverySession(true);
            setAuthorityStatus("recovery_only"); if (!recoveryIntent && storedRecoveryBinding !== PENDING_RECOVERY) void saveRecoveryBinding(nextAuthority); return;
          }
          publishAccountSessionAuthoritySnapshot(nextAuthority);
          setAuthority(nextAuthority); setSession(currentSession); setUser(currentSession.user);
          setAuthorityStatus("active");
          setIsPasswordRecoverySession(false); void clearRecoveryBinding();
          if (event === "SIGNED_IN") trackEvent("auth_sign_in_success", { source: "session_authority" });
        })().catch(() => {
          if (mounted && operation === sequence) clearRenderedAuthority("unknown");
        });
      }, 0);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      reconcile(event, nextSession, recoveryQuarantineIntent);
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
