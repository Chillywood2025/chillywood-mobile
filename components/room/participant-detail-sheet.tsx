import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { SharedParticipantIdentity, SharedParticipantLocalState } from "../../app/watch-party/_lib/_room-shared";

type ParticipantDetailSheetProps = {
  visible: boolean;
  participant: Pick<SharedParticipantIdentity, "displayName" | "role" | "isLive" | "isSpeaking"> | null;
  participantState: SharedParticipantLocalState | null;
  canShowProfileAction: boolean;
  safeAreaBottom?: number;
  onViewProfile?: () => void;
  onReportParticipant?: () => void;
  onClose: () => void;
  kicker?: string;
  overlayStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
};

export function ParticipantDetailSheet({
  visible,
  participant,
  participantState,
  canShowProfileAction,
  safeAreaBottom = 20,
  onViewProfile,
  onReportParticipant,
  onClose,
  kicker = "IN ROOM PARTICIPANT",
  overlayStyle,
  sheetStyle,
}: ParticipantDetailSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, overlayStyle]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(20, safeAreaBottom + 12) },
            sheetStyle,
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{participant?.displayName || "Participant"}</Text>
          <View style={styles.identityRow}>
            <View style={[styles.rolePill, participant?.role === "host" && styles.rolePillHost]}>
              <Text style={[styles.roleText, participant?.role === "host" && styles.roleTextHost]}>
                {participant?.role === "host" ? "Host" : "Viewer"}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>Present</Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  participant?.isLive ? styles.statusPillLive : styles.statusPillIdle,
                ]}
              >
                <Text style={[styles.statusText, participant?.isLive && styles.statusTextLive]}>
                  {participant?.isLive ? "Live" : "Idle"}
                </Text>
              </View>
              {participantState?.isMuted ? (
                <View style={[styles.statusPill, styles.statusPillMuted]}>
                  <Text style={styles.statusText}>Muted</Text>
                </View>
              ) : null}
              {participant?.isSpeaking ? (
                <View style={[styles.statusPill, styles.statusPillLive]}>
                  <Text style={[styles.statusText, styles.statusTextLive]}>Speaking</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.actionsLabel}>Actions</Text>

          {canShowProfileAction && onViewProfile ? (
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.82}
              onPress={onViewProfile}
            >
              <Text style={styles.actionBtnText}>View Profile</Text>
            </TouchableOpacity>
          ) : null}

          {onReportParticipant ? (
            <TouchableOpacity
              style={styles.actionBtn}
              activeOpacity={0.82}
              onPress={onReportParticipant}
            >
              <Text style={styles.actionBtnText}>Report Participant</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.actionBtnClose}
            activeOpacity={0.82}
            onPress={onClose}
          >
            <Text style={styles.actionBtnCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,12,12,0.98)",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 10,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 2,
  },
  kicker: {
    color: "#7A7A7A",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: -2,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  identityRow: { gap: 7, marginBottom: 2 },
  rolePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rolePillHost: {
    borderColor: "rgba(220,20,60,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  roleText: { color: "#CFCFCF", fontSize: 11, fontWeight: "800" },
  roleTextHost: { color: "#F7D6DD" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillLive: {
    borderColor: "rgba(46,204,64,0.34)",
    backgroundColor: "rgba(46,204,64,0.12)",
  },
  statusPillIdle: {
    borderColor: "rgba(122,128,143,0.35)",
    backgroundColor: "rgba(122,128,143,0.14)",
  },
  statusPillMuted: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  statusText: { color: "#B8B8B8", fontSize: 10.5, fontWeight: "700" },
  statusTextLive: { color: "#BFDAC4" },
  actionsLabel: {
    color: "#7A7A7A",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 2,
  },
  actionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  actionBtnText: { color: "#E2E2E2", fontSize: 14, fontWeight: "800" },
  actionBtnClose: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    alignItems: "center",
  },
  actionBtnCloseText: { color: "#BEBEBE", fontSize: 13, fontWeight: "800" },
});
