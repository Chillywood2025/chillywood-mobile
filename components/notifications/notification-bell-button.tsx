import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

const formatNotificationTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export function NotificationBellButton({ surface, roomSafe = false, style }: NotificationBellButtonProps) {
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
  const [stateOwner, setStateOwner] = useState(ownerKey);
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [trayVisible, setTrayVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<NotificationListCursor | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ownsActivity = useCallback(() => mountedRef.current && !!ownerKey && ownerRef.current === ownerKey
    && getCurrentNotificationActivityOwnerKey() === ownerKey, [ownerKey]);

  useLayoutEffect(() => {
    refreshSequence.current += 1;
    fullRefreshPending.current = false;
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
  }, [ownerKey]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; refreshSequence.current += 1; actionSequence.current += 1; };
  }, []);

  const mergeNotifications = useCallback((...groups: NotificationRecord[][]) => {
    const seen = new Set<string>();
    return groups.flat().filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    }).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!ownsActivity()) return;
    if (actionPending.current) { refreshAfterAction.current = true; return; }
    refreshAfterAction.current = false;
    const sequence = ++refreshSequence.current;
    fullRefreshPending.current = true;
    const isCurrent = () => ownsActivity() && sequence === refreshSequence.current;
    setLoading(true);
    setLoadingMore(false);
    try {
      const [nextSummary, importantRows, recentPage] = await Promise.all([
        readNotificationSummary(user!.id),
        readImportantNotificationList(user!.id, 30),
        readNotificationListPage(user!.id, 30),
      ]);
      if (!isCurrent()) return;
      if (recentPage.status !== "resolved") throw new Error("notification_page_unavailable");
      setSummary(nextSummary);
      setNotifications(mergeNotifications(importantRows, recentPage.items)
        .filter((notification) => !notification.isDismissed));
      setNextCursor(recentPage.nextCursor);
      setLoadError(null);
    } catch {
      if (!isCurrent()) return;
      setLoadError("Notifications could not be refreshed. Your existing activity is unchanged.");
    } finally {
      if (isCurrent()) { fullRefreshPending.current = false; setLoading(false); }
    }
  }, [mergeNotifications, ownsActivity, user]);

  useEffect(() => subscribeToNotificationActivity(ownerKey, () => { void refreshNotifications(); }), [ownerKey, refreshNotifications]);

  const loadMoreNotifications = useCallback(async () => {
    if (!nextCursor || loadingMore || fullRefreshPending.current || actionPending.current || !ownsActivity()) return;
    const sequence = ++refreshSequence.current;
    const isCurrent = () => ownsActivity() && sequence === refreshSequence.current;
    setLoadingMore(true);
    setLoading(false);
    try {
      const page = await readNotificationListPage(user!.id, 30, nextCursor);
      if (!isCurrent()) return;
      if (page.status !== "resolved") throw new Error("notification_page_unavailable");
      setNotifications((current) => mergeNotifications(current, page.items)
        .filter((notification) => !notification.isDismissed));
      setNextCursor(page.nextCursor);
      setLoadError(null);
    } catch {
      if (!isCurrent()) return;
      setLoadError("More activity could not be loaded. Try again when your connection is available.");
    } finally {
      if (isCurrent()) setLoadingMore(false);
    }
  }, [loadingMore, mergeNotifications, nextCursor, ownsActivity, user]);

  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications]),
  );

  const visibleOwner = stateOwner === ownerKey && ownsActivity();
  const visibleNotifications = visibleOwner ? notifications : [];
  const visibleError = visibleOwner ? actionError ?? loadError : null;
  const unreadCount = Math.max(0, visibleOwner ? summary.unreadCount : 0);
  const accessibilityLabel = unreadCount > 0
    ? `${unreadCount} unread notifications`
    : "Notifications";

  const openTray = () => {
    setTrayVisible(true);
    void refreshNotifications();
  };

  const openNotificationSettings = () => {
    setTrayVisible(false);
    router.push({
      pathname: "/settings",
      params: { section: "notifications" },
    });
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (busyId || actionPending.current || !ownsActivity()) return;
    const action = ++actionSequence.current;
    actionPending.current = true;
    refreshSequence.current += 1;
    fullRefreshPending.current = false;
    const isCurrent = () => ownsActivity() && action === actionSequence.current;
    setBusyId(notification.id);
    setLoading(false);
    setLoadingMore(false);
    try {
      const path = resolveNotificationPath(notification.deepLink);
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
      invalidateNotificationActivity(ownerKey);
      if (path) {
        setTrayVisible(false);
        router.push(path as Parameters<typeof router.push>[0]);
      }
    } finally {
      if (isCurrent()) {
        actionPending.current = false;
        setBusyId(null);
        if (refreshAfterAction.current) void refreshNotifications();
      }
    }
  };

  const dismiss = async (notification: NotificationRecord) => {
    if (busyId || actionPending.current || !ownsActivity()) return;
    const action = ++actionSequence.current;
    actionPending.current = true;
    refreshSequence.current += 1;
    fullRefreshPending.current = false;
    const isCurrent = () => ownsActivity() && action === actionSequence.current;
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
        invalidateNotificationActivity(ownerKey);
      } else {
        setActionError("This notification could not be dismissed. Please try again.");
      }
    } finally {
      if (isCurrent()) {
        actionPending.current = false;
        setBusyId(null);
        if (refreshAfterAction.current) void refreshNotifications();
      }
    }
  };

  const renderRow = (notification: NotificationRecord) => {
    const busy = busyId === notification.id;
    const routeReady = !!resolveNotificationPath(notification.deepLink);
    const createdLabel = formatNotificationTimestamp(notification.createdAt);
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
          accessibilityLabel={`Open notification: ${notification.title}. ${createdLabel}`}
        >
          <Text style={[styles.notificationTitle, !notification.isRead && styles.notificationTitleUnread]}>
            {notification.title}
          </Text>
          {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
          <Text style={styles.notificationMeta}>
            {createdLabel} · {notification.isRead ? "Read" : "Unread"} · {actionCopy}
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
