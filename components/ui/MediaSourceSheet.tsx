import React, { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MediaPickerSource } from "../../_lib/mediaPickerCoordinator";
import { color } from "./tokens";
import { IconSymbol } from "./icon-symbol";
import { CHILLYWOOD_VISUAL } from "./chillywood-visual-system";

export type MediaSourceSheetProps = {
  visible: boolean;
  preparing?: boolean;
  preparingPlacement?: "screen" | "inline";
  title: string;
  sources: MediaPickerSource[];
  mediaKind?: "image" | "video" | "attachment";
  advancedLabel?: string;
  onChoose: (source: MediaPickerSource | "advanced") => void;
  onCancel: () => void;
  onDismiss: () => void;
  onUnmount?: () => void;
};

export function MediaSourceSheet(props: MediaSourceSheetProps) {
  const insets = useSafeAreaInsets();
  const onUnmount = props.onUnmount;
  useEffect(() => () => onUnmount?.(), [onUnmount]);
  const video = props.mediaKind === "video";
  const gallery = props.sources.includes("gallery");
  const labels = {
    gallery: { icon: "photo.on.rectangle" as const, title: "Gallery app", detail: video ? "Choose one video in an installed gallery app" : "Choose one photo in an installed gallery app" },
    photos: { icon: "photo.on.rectangle" as const, title: gallery ? "System photo library" : video ? "Video library" : "Photo library", detail: video ? "Browse videos and albums" : "Browse photos and albums" },
    camera: { icon: "camera" as const, title: "Take a photo", detail: "Use your camera" },
    files: { icon: "folder" as const, title: "Choose from Files", detail: "Browse device storage and available providers" },
  };
  return <>
    <Modal transparent visible={props.visible} animationType="none" presentationStyle="overFullScreen"
    onRequestClose={props.onCancel} onDismiss={props.onDismiss} statusBarTranslucent>
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} accessibilityRole="button" accessibilityLabel="Close attachment choices" onPress={props.onCancel} testID="media-source-backdrop" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.heading}><Text style={styles.title} accessibilityRole="header">{props.title}</Text>
          <Pressable onPress={props.onCancel} accessibilityRole="button" accessibilityLabel="Close attachment choices" hitSlop={8} style={styles.close} testID="media-source-close"><IconSymbol name="xmark" size={24} color={color.textSecondary} /></Pressable>
        </View>
        <ScrollView bounces={false} style={styles.options}>
          {props.sources.map((source) => <Pressable key={source} accessibilityRole="button" accessibilityLabel={labels[source].title}
            onPress={() => props.onChoose(source)} testID={`media-source-${source}`} style={[styles.row, (source === "gallery" || (source === "photos" && !gallery)) && styles.primaryRow]}>
            <View style={styles.icon}><IconSymbol name={labels[source].icon} size={24} color={color.textAccent} /></View>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>{labels[source].title}</Text><Text style={styles.detail}>{labels[source].detail}</Text></View>
            <IconSymbol name="chevron.right" size={22} color={color.textSecondary} />
          </Pressable>)}
          {video ? <Text style={styles.note}>System-library videos may be converted for compatibility when imported.</Text> : null}
          {props.advancedLabel ? <Pressable onPress={() => props.onChoose("advanced")} accessibilityRole="button" style={styles.advanced} testID="media-source-advanced"><Text style={styles.advancedText}>{props.advancedLabel}</Text></Pressable> : null}
        </ScrollView>
        <Pressable onPress={props.onCancel} accessibilityRole="button" style={styles.cancel} testID="media-source-cancel"><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  </Modal>
    {props.preparing && !props.visible ? <View testID="media-picker-preparing" pointerEvents="none"
      accessible accessibilityRole="text" accessibilityLiveRegion="polite"
      accessibilityLabel="Preparing attachment. Cloud files may take a moment."
      style={[styles.preparing, props.preparingPlacement === "inline" ? styles.preparingInline
        : [styles.preparingScreen, { top: Math.max(insets.top ?? 0, 12) + 56 }]]}>
      <Text style={styles.preparingTitle}>Preparing attachment…</Text>
      <Text style={styles.detail}>Cloud files may take a moment.</Text>
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  // Screen-root sibling, never another native presentation. It remains above
  // background/scroll siblings while letting every touch pass to controls.
  preparing: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder },
  preparingScreen: { position: "absolute", left: 16, right: 16, zIndex: 1000, elevation: 12 },
  preparingInline: { marginVertical: 12 },
  preparingTitle: { color: color.textPrimary, fontSize: 15, fontWeight: "600" },
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center", padding: 18, backgroundColor: "rgba(6,8,14,0.72)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { width: "100%", backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderRadius: 22, paddingHorizontal: 18, maxHeight: "85%", borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.textSecondary, alignSelf: "center", marginTop: 10, marginBottom: 8 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  title: { flex: 1, color: color.textPrimary, fontSize: 20, fontWeight: "700" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  options: { flexGrow: 0 },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 16, gap: 12, marginBottom: 8 },
  primaryRow: { backgroundColor: color.accentSurface, borderWidth: 1, borderColor: color.borderPrimarySoft },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceRaised },
  rowCopy: { flex: 1 }, rowTitle: { fontSize: 16, color: color.textPrimary, fontWeight: "600" },
  detail: { fontSize: 13, lineHeight: 18, color: color.textSecondary, marginTop: 3 },
  note: { color: color.textSecondary, fontSize: 12, lineHeight: 17, marginHorizontal: 12, marginVertical: 4 },
  advanced: { minHeight: 44, padding: 12, justifyContent: "center" }, advancedText: { color: color.textAccent, fontSize: 14 },
  cancel: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 4 }, cancelText: { color: color.textPrimary, fontSize: 16, fontWeight: "600" },
});
