import { ConversationTimestamp } from "../../components/social/conversation-timestamp";
import { conversationCreatedAt, formatConversationTimestamp } from "../../_lib/conversationTimestamp";
import { useConversationClock } from "../../hooks/use-conversation-clock";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  dismissNotification,
  markNotificationRead,
  readImportantNotificationList,
  readNotificationListPage,
  readNotificationSummary,
  type NotificationListCursor,
  resolveNotificationPath,
  type NotificationRecord,
  type NotificationSummary,
} from "../../_lib/notifications";
import {
  CHILLYWOOD_VISUAL,
  ChillywoodPrimaryActionFill,
} from "../ui/chillywood-visual-system";
import { useSession } from "../../_lib/session";
import { getCurrentNotificationActivityOwnerKey, getNotificationActivityOwnerKey, invalidateNotificationActivity, subscribeToNotificationActivity } from "../../_lib/notificationActivity";
import { createNotificationHintBudget } from "../../_lib/notificationHintBudget";

type NotificationBellButtonProps = {
  surface: string;
  roomSafe?: boolean;
  style?: StyleProp<ViewStyle>;
};

const EMPTY_SUMMARY: NotificationSummary = {
  categories: [],
  latestCreatedAt: null,
  totalCount: 0,
  undismissedCount: 0,
  unreadCount: 0,
};

const formatBadgeCount = (count: number) => (count > 99 ? "99+" : String(count));
const NOTIFICATION_READ_DEADLINE_MS = 10_000;
type NotificationReadRequest = { kind: "refresh"; full: boolean } | { kind: "more"; cursor: NotificationListCursor };


export function NotificationBellButton({ surface, roomSafe = false, style }: NotificationBellButtonProps) {
  useConversationClock();
  const { authority, authorityStatus, user } = useSession();
  const ownerKey = authorityStatus === "active" && authority?.userId === user?.id
    ? getNotificationActivityOwnerKey(authority) : "";
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const mountedRef = useRef(true);
  const refreshSequence = useRef(0);
  const fullRefreshPending = useRef(false);
  const actionSequence = useRef(0);
  const actionPending = useRef(false);
  const refreshAfterAction = useRef(false);
  const focusedRef = useRef(false);
  const interactionEpochRef = useRef(0);
  const foregroundRef = useRef(AppState.currentState === "active");
  const trayVisibleRef = useRef(false);
  const readFlight = useRef<{ controller: AbortController; ownerKey: string } | null>(null);
  const queuedRead = useRef<NotificationReadRequest | null>(null);
  const runReadRef = useRef<(request: NotificationReadRequest) => void>(() => {});
  const [stateOwner, setStateOwner] = useState(ownerKey);
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [trayVisible, setTrayVisible] = useState(false);
  trayVisibleRef.current = trayVisible;
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<NotificationListCursor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ownsActivity = useCallback(() => mountedRef.current && !!ownerKey && ownerRef.current === ownerKey
    && getCurrentNotificationActivityOwnerKey() === ownerKey, [ownerKey]);
  const canRead = useCallback(() => ownsActivity() && focusedRef.current && foregroundRef.current, [ownsActivity]);
  const retireReads = useCallback(() => {
    refreshSequence.current += 1;
    queuedRead.current = null;
    readFlight.current?.controller.abort();
  }, []);

  useLayoutEffect(() => {
    interactionEpochRef.current += 1;
    retireReads();
    actionSequence.current += 1;
    actionPending.current = false;
    refreshAfterAction.current = false;
    setStateOwner(ownerKey);
    setSummary(EMPTY_SUMMARY);
    setNotifications([]);
    setNextCursor(null);
    setLoadError(null);
    setActionError(null);
    setBusyId(null);
    setLoading(false);
    setLoadingMore(false);
    setTrayVisible(false);
    trayVisibleRef.current = false;
  }, [ownerKey, retireReads]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; retireReads(); actionSequence.current += 1; };
  }, [retireReads]);

  const mergeNotifications = useCallback((...groups: NotificationRecord[][]) => {
    const seen = new Set<string>();
    return groups.flat().filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    }).sort((left, right) => {
      const milliseconds = (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0);
      if (milliseconds) return milliseconds;
      const micros = (value: string) => Number((value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/iu)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
      // Match the server's created_at DESC, id DESC order after merging pages
      // and important activity; importance must not pin an older row first.
      return micros(right.createdAt) - micros(left.createdAt) || right.id.localeCompare(left.id);
    });
  }, []);

  const runRead = useCallback(async (request: NotificationReadRequest) => {
    if (!canRead() || readFlight.current || actionPending.current) return;
    const flight = { controller: new AbortController(), ownerKey };
    readFlight.current = flight;
    const signal = flight.controller.signal;
    const sequence = ++refreshSequence.current;
    fullRefreshPending.current = request.kind === "refresh";
    const isCurrent = () => canRead() && !signal.aborted && sequence === refreshSequence.current;
    setLoading(request.kind === "refresh");
    setLoadingMore(request.kind === "more");
    const deadline = setTimeout(() => {
      if (isCurrent()) {
        setLoading(false);
        setLoadingMore(false);
        setLoadError("Notifications could not be refreshed. Your existing activity is unchanged.");
      }
      flight.controller.abort();
      // Retain actual source ownership until settlement, even if a transport
      // ignores cancellation. Resume/manual retries cannot pile up requests.
    }, NOTIFICATION_READ_DEADLINE_MS);
    try {
      if (request.kind === "more") {
        const page = await readNotificationListPage(user!.id, 30, request.cursor, signal);
        if (!isCurrent()) return;
        if (page.status !== "resolved") throw new Error("notification_page_unavailable");
        setNotifications(current => mergeNotifications(current, page.items).filter(item => !item.isDismissed));
        setNextCursor(page.nextCursor);
      } else if (!request.full) {
        const nextSummary = await readNotificationSummary(user!.id, signal);
        if (!isCurrent()) return;
        setSummary(nextSummary);
      } else {
        // Await every source, including failed siblings; Promise.all alone can
        // release ownership while another read/reconciliation is still alive.
        const results = await Promise.allSettled([
          readNotificationSummary(user!.id, signal),
          readImportantNotificationList(user!.id, 30, signal),
          readNotificationListPage(user!.id, 30, null, signal),
        ]);
        if (!isCurrent()) return;
        const [summaryResult, importantResult, pageResult] = results;
        if (summaryResult.status !== "fulfilled" || importantResult.status !== "fulfilled"
          || pageResult.status !== "fulfilled" || pageResult.value.status !== "resolved") {
          throw new Error("notification_page_unavailable");
        }
        setSummary(summaryResult.value);
        setNotifications(mergeNotifications(importantResult.value, pageResult.value.items)
          .filter(notification => !notification.isDismissed));
        setNextCursor(pageResult.value.nextCursor);
      }
      setLoadError(null);
    } catch {
      if (!isCurrent()) return;
      setLoadError("Notifications could not be refreshed. Your existing activity is unchanged.");
    } finally {
      clearTimeout(deadline);
      if (readFlight.current === flight) {
        readFlight.current = null;
        fullRefreshPending.current = false;
        if (isCurrent()) { setLoading(false); setLoadingMore(false); }
        const queued = queuedRead.current;
        queuedRead.current = null;
        // The current render's runner owns any successor account/lifetime.
        if (queued) runReadRef.current(queued);
      }
    }
  }, [canRead, mergeNotifications, ownerKey, user]);
  runReadRef.current = request => { void runRead(request); };

  const refreshNotifications = useCallback((fresh = true, full = trayVisibleRef.current) => {
    if (!canRead()) return;
    if (actionPending.current) { refreshAfterAction.current = true; return; }
    refreshAfterAction.current = false;
    const request: NotificationReadRequest = { kind: "refresh", full };
    if (readFlight.current) {
      queuedRead.current = request;
      if (fresh) {
        refreshSequence.current += 1;
        readFlight.current.controller.abort();
        setLoading(false);
        setLoadingMore(false);
      }
    } else runReadRef.current(request);
  }, [canRead]);

  const loadMoreNotifications = useCallback(async () => {
    if (!nextCursor || loadingMore || readFlight.current || actionPending.current || !canRead()) return;
    runReadRef.current({ kind: "more", cursor: nextCursor });
  }, [canRead, loadingMore, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      foregroundRef.current = AppState.currentState === "active";
      const budget = createNotificationHintBudget(() => refreshNotifications(false));
      const unsubscribe = subscribeToNotificationActivity(ownerKey, reason => {
        if (!canRead()) return;
        if (reason === "confirmed") refreshNotifications();
        else budget.hint();
      });
      const appState = AppState.addEventListener("change", state => {
        const wasForeground = foregroundRef.current;
        foregroundRef.current = state === "active";
        if (!foregroundRef.current) {
          interactionEpochRef.current += 1;
          retireReads(); setLoading(false); setLoadingMore(false);
        } else if (!wasForeground) refreshNotifications();
      });
      void refreshNotifications();
      return () => {
        interactionEpochRef.current += 1;
        focusedRef.current = false;
        budget.stop(); unsubscribe(); appState.remove(); retireReads();
      };
    }, [canRead, ownerKey, refreshNotifications, retireReads]),
  );

  const visibleOwner = stateOwner === ownerKey && ownsActivity();
  const visibleNotifications = visibleOwner ? notifications : [];
  const visibleError = visibleOwner ? actionError ?? loadError : null;
  const unreadCount = Math.max(0, visibleOwner ? summary.unreadCount : 0);
  const accessibilityLabel = unreadCount > 0
    ? `${unreadCount} unread notifications`
    : "Notifications";

  const openTray = () => {
    trayVisibleRef.current = true;
    setTrayVisible(true);
    refreshNotifications(true, true);
  };

  const openNotificationSettings = () => {
    setTrayVisible(false);
    router.push({
      pathname: "/settings",
      params: { section: "notifications" },
    });
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (busyId || actionPending.current || !canRead()) return;
    const action = ++actionSequence.current;
    const interactionEpoch = interactionEpochRef.current;
    actionPending.current = true;
    retireReads();
    const ownsAction = () => ownsActivity() && action === actionSequence.current;
    const isCurrent = () => ownsAction() && canRead() && interactionEpochRef.current === interactionEpoch;
    setBusyId(notification.id);
    setLoading(false);
    setLoadingMore(false);
    try {
      const path = resolveNotificationPath(notification.deepLink, {
        notificationType: notification.notificationType,
        targetEntityId: notification.target.entityId,
        targetContext: notification.target.context,
      });
      const result = await markNotificationRead(notification.id).catch(() => null);
      if (!isCurrent()) return;
      refreshSequence.current += 1;
      if (!result || (result.status !== "completed" && result.status !== "noop")) {
        setActionError("This notification could not be marked as read. Please try again.");
        return;
      }
      setActionError(null);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id
          ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }
          : item
      )));
      invalidateNotificationActivity(ownerKey, "confirmed");
      if (path) {
        setTrayVisible(false);
        router.push(path as Parameters<typeof router.push>[0]);
      }
    } finally {
      if (ownsAction()) {
        actionPending.current = false;
        setBusyId(null);
        if (refreshAfterAction.current) void refreshNotifications();
      }
    }
  };

  const dismiss = async (notification: NotificationRecord) => {
    if (busyId || actionPending.current || !canRead()) return;
    const action = ++actionSequence.current;
    const interactionEpoch = interactionEpochRef.current;
    actionPending.current = true;
    retireReads();
    const ownsAction = () => ownsActivity() && action === actionSequence.current;
    const isCurrent = () => ownsAction() && canRead() && interactionEpochRef.current === interactionEpoch;
    setBusyId(notification.id);
    setLoading(false);
    setLoadingMore(false);
    try {
      const result = await dismissNotification(notification.id).catch(() => null);
      if (!isCurrent()) return;
      refreshSequence.current += 1;
      if (result?.status === "completed" || result?.status === "noop") {
        setActionError(null);
        setNotifications((current) => current.filter((item) => item.id !== notification.id));
        invalidateNotificationActivity(ownerKey, "confirmed");
      } else {
        setActionError("This notification could not be dismissed. Please try again.");
      }
    } finally {
      if (ownsAction()) {
        actionPending.current = false;
        setBusyId(null);
        if (refreshAfterAction.current) void refreshNotifications();
      }
    }
  };

  const renderRow = (notification: NotificationRecord) => {
    const busy = busyId === notification.id;
    const routeReady = !!resolveNotificationPath(notification.deepLink, {
      notificationType: notification.notificationType,
      targetEntityId: notification.target.entityId,
      targetContext: notification.target.context,
    });
    const timestamp = formatConversationTimestamp(conversationCreatedAt(notification));
    const actionCopy = notification.isExpired
      ? "Expired"
      : notification.actionStatus === "handled"
        ? "Handled"
        : routeReady
          ? notification.actionLabel
          : "No route in this build";
    return (
      <View
        key={notification.id}
        style={[styles.notificationRow, !notification.isRead && styles.notificationRowUnread]}
        testID={`notification-tray-row-${notification.notificationType}`}
      >
        <TouchableOpacity
          style={styles.notificationOpenAction}
          activeOpacity={0.86}
          disabled={busy || !routeReady}
          onPress={() => {
            void openNotification(notification);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open notification: ${notification.title}. ${timestamp.fullLabel}`}
        >
          <Text style={[styles.notificationTitle, !notification.isRead && styles.notificationTitleUnread]}>
            {notification.title}
          </Text>
          {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
          <Text style={styles.notificationMeta}>
            <ConversationTimestamp value={conversationCreatedAt(notification)} /> · {notification.isRead ? "Read" : "Unread"} · {actionCopy}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissButton}
          activeOpacity={0.82}
          disabled={busy}
          onPress={() => {
            void dismiss(notification);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss notification: ${notification.title}`}
          testID={`notification-tray-dismiss-${notification.notificationType}`}
        >
          {busy ? <ActivityIndicator color="#EAF0FF" size="small" /> : (
            <MaterialIcons name="close" size={16} color="#EAF0FF" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const importantNotifications = visibleNotifications.filter((notification) => notification.isImportant);
  const recentNotifications = visibleNotifications.filter((notification) => !notification.isImportant);

  return (
    <>
      <TouchableOpacity
        testID={`${surface}-notification-bell`}
        style={[styles.bellButton, roomSafe && styles.roomSafeBellButton, style]}
        onPress={openTray}
        activeOpacity={0.86}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <MaterialIcons name="notifications-none" size={18} color="#F4F7FC" />
        {unreadCount > 0 ? (
          <View style={styles.badge} testID={`${surface}-notification-bell-badge`}>
            <Text style={styles.badgeText}>{formatBadgeCount(unreadCount)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      <Modal
        visible={trayVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTrayVisible(false)}
      >
        <View style={styles.modalRoot} testID={`${surface}-notification-tray`}>
          <Pressable
            style={styles.modalScrim}
            onPress={() => setTrayVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
          />
          <View style={[styles.traySheet, roomSafe && styles.roomSafeTraySheet]}>
            <View style={styles.trayHeader}>
              <View style={styles.trayHeaderCopy}>
                <Text style={styles.trayKicker}>{roomSafe ? "ACTIVITY" : "NOTIFICATIONS"}</Text>
                <Text style={styles.trayTitle}>Activity</Text>
                <Text style={styles.trayBody}>
                  {roomSafe
                    ? "You'll stay in the room while checking updates. Opening this tray will not mute, unmute, or disconnect you."
                    : "Updates about creator purchases, events, account alerts, and recent activity."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                activeOpacity={0.84}
                onPress={() => setTrayVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
              >
                <MaterialIcons name="close" size={18} color="#F4F7FC" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.trayList} contentContainerStyle={styles.trayListContent}>
              {loading && visibleNotifications.length === 0 ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator color="#DC143C" size="small" />
                  <Text style={styles.emptyStateText}>Loading notifications...</Text>
                </View>
              ) : visibleNotifications.length ? (
                <>
                  {importantNotifications.length ? (
                    <View style={styles.traySection} testID={`${surface}-notification-tray-important-section`}>
                      <Text style={styles.traySectionTitle}>Important / Action Needed</Text>
                      <Text style={styles.traySectionBody}>These stay visible after read until handled, dismissed, revoked, or expired.</Text>
                      {importantNotifications.map(renderRow)}
                    </View>
                  ) : null}
                  {recentNotifications.length ? (
                    <View style={styles.traySection} testID={`${surface}-notification-tray-recent-section`}>
                      <Text style={styles.traySectionTitle}>Recent Activity</Text>
                      {recentNotifications.map(renderRow)}
                    </View>
                  ) : null}
                  {visibleError ? <Text style={styles.loadErrorText}>{visibleError}</Text> : null}
                  {nextCursor ? (
                    <TouchableOpacity
                      style={styles.loadMoreButton}
                      activeOpacity={0.84}
                      disabled={loading || loadingMore}
                      onPress={() => { void loadMoreNotifications(); }}
                      accessibilityRole="button"
                      accessibilityLabel="Load more notifications"
                    >
                      {loadingMore ? <ActivityIndicator color="#EAF0FF" size="small" /> : (
                        <Text style={styles.loadMoreButtonText}>Show More Activity</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="notifications-none" size={22} color="#8D98AE" />
                  <Text style={styles.emptyStateTitle}>{visibleError ? "Notifications unavailable" : "No notifications yet"}</Text>
                  <Text style={styles.emptyStateText}>{visibleError ?? "Your recent activity will appear here."}</Text>
                </View>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.fullActivityButton}
              activeOpacity={0.86}
              onPress={openNotificationSettings}
              accessibilityRole="button"
              accessibilityLabel="Open notification settings"
              testID={`${surface}-notification-tray-open-settings`}
            >
              <ChillywoodPrimaryActionFill radius={21} />
              <Text style={styles.fullActivityButtonText}>Open Notification Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(12,12,16,0.68)",
    alignItems: "center",
    justifyContent: "center",
  },
  roomSafeBellButton: {
    backgroundColor: "rgba(7,12,18,0.74)",
    borderColor: "rgba(169,246,210,0.26)",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#DC143C",
    borderWidth: 1,
    borderColor: "#08090D",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 11,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  traySheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    shadowColor: CHILLYWOOD_VISUAL.primaryGlow,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 18,
  },
  roomSafeTraySheet: {
    maxHeight: "62%",
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
  },
  trayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  trayHeaderCopy: {
    flex: 1,
    gap: 5,
  },
  trayKicker: {
    color: "#8D98AE",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
  },
  trayTitle: {
    color: "#F4F7FC",
    fontSize: 22,
    fontWeight: "900",
  },
  trayBody: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  trayList: {
    marginTop: 14,
  },
  trayListContent: {
    gap: 10,
    paddingBottom: 10,
  },
  traySection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    padding: 10,
    gap: 10,
  },
  traySectionTitle: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "900",
  },
  traySectionBody: {
    color: "#AAB4C8",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  loadErrorText: {
    color: "#F7C48B",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  loadMoreButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  loadMoreButtonText: {
    color: "#EAF0FF",
    fontSize: 12,
    fontWeight: "900",
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    padding: 12,
  },
  notificationRowUnread: {
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  notificationOpenAction: {
    flex: 1,
    gap: 4,
  },
  notificationTitle: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "800",
  },
  notificationTitleUnread: {
    color: "#FFFFFF",
  },
  notificationBody: {
    color: "#B8C2D6",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  notificationMeta: {
    color: "#7F8CA3",
    fontSize: 10,
    fontWeight: "800",
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
  },
  emptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    padding: 18,
  },
  emptyStateTitle: {
    color: "#EAF0FF",
    fontSize: 14,
    fontWeight: "900",
  },
  emptyStateText: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  fullActivityButton: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHILLYWOOD_VISUAL.accentBlue,
    overflow: "hidden",
    shadowColor: CHILLYWOOD_VISUAL.primaryGlow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 10,
  },
  fullActivityButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
