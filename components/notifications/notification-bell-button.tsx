import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
  readNotificationList,
  readNotificationSummary,
  resolveNotificationPath,
  type NotificationRecord,
  type NotificationSummary,
} from "../../_lib/notifications";

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

export function NotificationBellButton({ surface, roomSafe = false, style }: NotificationBellButtonProps) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [trayVisible, setTrayVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSummary, nextNotifications] = await Promise.all([
        readNotificationSummary(),
        readNotificationList(undefined, 20),
      ]);
      setSummary(nextSummary);
      setNotifications(nextNotifications.filter((notification) => !notification.isDismissed));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshNotifications();
    }, [refreshNotifications]),
  );

  const unreadCount = Math.max(0, summary.unreadCount);
  const accessibilityLabel = unreadCount > 0
    ? `${unreadCount} unread notifications`
    : "Notifications";

  const openTray = () => {
    setTrayVisible(true);
    void refreshNotifications();
  };

  const openFullActivity = () => {
    setTrayVisible(false);
    router.push({
      pathname: "/settings",
      params: { section: "notifications" },
    });
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (busyId) return;
    setBusyId(notification.id);
    try {
      const path = resolveNotificationPath(notification.deepLink);
      await markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id
          ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }
          : item
      )));
      setSummary((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - (notification.isRead ? 0 : 1)),
      }));
      if (path) {
        setTrayVisible(false);
        router.push(path as Parameters<typeof router.push>[0]);
      }
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (notification: NotificationRecord) => {
    if (busyId) return;
    setBusyId(notification.id);
    try {
      const result = await dismissNotification(notification.id);
      if (result.status === "completed" || result.status === "noop") {
        setNotifications((current) => current.filter((item) => item.id !== notification.id));
        setSummary((current) => ({
          ...current,
          undismissedCount: Math.max(0, current.undismissedCount - 1),
          unreadCount: notification.isRead ? current.unreadCount : Math.max(0, current.unreadCount - 1),
        }));
      }
    } finally {
      setBusyId(null);
    }
  };

  const renderRow = (notification: NotificationRecord) => {
    const busy = busyId === notification.id;
    const routeReady = !!resolveNotificationPath(notification.deepLink);
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
          accessibilityLabel={`Open notification: ${notification.title}`}
        >
          <Text style={[styles.notificationTitle, !notification.isRead && styles.notificationTitleUnread]}>
            {notification.title}
          </Text>
          {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
          <Text style={styles.notificationMeta}>
            {notification.isRead ? "Read" : "Unread"} · {routeReady ? "Tap to open" : "No route in this build"}
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
                <Text style={styles.trayKicker}>{roomSafe ? "ROOM-SAFE ACTIVITY" : "NOTIFICATIONS"}</Text>
                <Text style={styles.trayTitle}>Activity</Text>
                <Text style={styles.trayBody}>
                  {roomSafe
                    ? "Room/live surfaces use room-safe notification tray/banner behavior. Opening this tray does not leave, mute, unmute, or disconnect the room."
                    : "Real notification records for creator money, events, system alerts, and supported activity."}
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
              {loading ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator color="#DC143C" size="small" />
                  <Text style={styles.emptyStateText}>Loading real notification records...</Text>
                </View>
              ) : notifications.length ? (
                notifications.map(renderRow)
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="notifications-none" size={22} color="#8D98AE" />
                  <Text style={styles.emptyStateTitle}>No notifications yet</Text>
                  <Text style={styles.emptyStateText}>No fake counts or records are shown.</Text>
                </View>
              )}
            </ScrollView>
            <TouchableOpacity
              style={styles.fullActivityButton}
              activeOpacity={0.86}
              onPress={openFullActivity}
              accessibilityRole="button"
              accessibilityLabel="Open full Notifications Activity settings"
              testID={`${surface}-notification-tray-open-settings`}
            >
              <Text style={styles.fullActivityButtonText}>Open Activity Settings</Text>
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
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(8,9,14,0.98)",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },
  roomSafeTraySheet: {
    maxHeight: "62%",
    borderColor: "rgba(169,246,210,0.24)",
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
    borderColor: "rgba(255,255,255,0.12)",
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
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.045)",
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
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  emptyState: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.92)",
  },
  fullActivityButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
