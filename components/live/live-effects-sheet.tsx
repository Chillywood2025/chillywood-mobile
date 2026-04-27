import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  CHILLYFECTS_BRAND_NAME,
  LIVE_EFFECT_CATEGORIES,
  LIVE_EFFECT_ITEMS,
  LIVE_EFFECT_OFF_ID,
  getLiveEffectById,
  getLiveEffectStatusCopy,
  getLiveEffectStatusLabel,
  isLiveEffectSelectable,
  type LiveEffectItem,
} from "../../_lib/liveEffects";

type LiveEffectsPanelProps = {
  selectedEffectId: string;
  onSelectEffect: (effectId: string) => void;
  cameraAvailable: boolean;
  surfaceLabel: string;
  showHeader?: boolean;
  style?: StyleProp<ViewStyle>;
};

const getEffectCategoryItems = (categoryId: LiveEffectItem["category"]) => (
  LIVE_EFFECT_ITEMS.filter((effect) => effect.category === categoryId)
);

export function LiveEffectsPanel({
  selectedEffectId,
  onSelectEffect,
  cameraAvailable,
  surfaceLabel,
  showHeader = true,
  style,
}: LiveEffectsPanelProps) {
  const selectedEffect = getLiveEffectById(selectedEffectId);
  const selectedStatusCopy = getLiveEffectStatusCopy(selectedEffect);

  return (
    <View style={[styles.panel, style]}>
      {showHeader ? (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>CHI’LLYFECTS FOUNDATION</Text>
            <Text style={styles.title}>{CHILLYFECTS_BRAND_NAME}</Text>
          </View>
          <View style={styles.activePill}>
            <Text style={styles.activePillText}>
              {selectedEffect.id === LIVE_EFFECT_OFF_ID ? "Off" : "Planned"}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.body}>
        {cameraAvailable
          ? `${surfaceLabel} can show the Chi’llyfects catalog, but this build does not process the outgoing camera track.`
          : `${surfaceLabel} Chi’llyfects turn on only when your camera role is active. Real processing is still a later lane.`}
      </Text>
      <View style={styles.selectedCard}>
        <View style={styles.selectedHeader}>
          <Text style={styles.selectedLabel}>Selected</Text>
          <Text style={styles.statusText}>{getLiveEffectStatusLabel(selectedEffect)}</Text>
        </View>
        <Text style={styles.selectedTitle}>{selectedEffect.label}</Text>
        <Text style={styles.selectedBody}>{selectedStatusCopy}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRail}
      >
        {LIVE_EFFECT_CATEGORIES.map((category) => {
          const categoryItems = getEffectCategoryItems(category.id);
          if (!categoryItems.length) return null;

          return (
            <View key={category.id} style={styles.categoryCard}>
              <Text style={styles.categoryTitle}>{category.label}</Text>
              <Text style={styles.categoryBody}>{category.description}</Text>
              <View style={styles.effectList}>
                {categoryItems.map((effect) => {
                  const selected = selectedEffect.id === effect.id;
                  const selectable = isLiveEffectSelectable(effect);

                  return (
                    <TouchableOpacity
                      key={effect.id}
                      style={[
                        styles.effectChip,
                        selected && styles.effectChipSelected,
                        !selectable && styles.effectChipDisabled,
                      ]}
                      activeOpacity={0.82}
                      disabled={!selectable}
                      onPress={() => onSelectEffect(effect.id)}
                    >
                      <Text style={[styles.effectLabel, selected && styles.effectLabelSelected]}>
                        {effect.label}
                      </Text>
                      <Text style={styles.effectStatus}>{getLiveEffectStatusLabel(effect)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: "#9DB8FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: "#F5F8FF",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
  },
  activePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activePillText: {
    color: "#DCE4F5",
    fontSize: 11,
    fontWeight: "800",
  },
  body: {
    color: "#C6D0E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  selectedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  selectedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  selectedLabel: {
    color: "#8E9DBA",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  statusText: {
    color: "#EFF4FF",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  selectedTitle: {
    color: "#F4F7FF",
    fontSize: 14,
    fontWeight: "900",
  },
  selectedBody: {
    color: "#AEB9CF",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  categoryRail: {
    gap: 10,
    paddingRight: 8,
  },
  categoryCard: {
    width: 218,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.14)",
    backgroundColor: "rgba(7,12,22,0.62)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  categoryTitle: {
    color: "#F3F7FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  categoryBody: {
    color: "#AEB9CF",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
  },
  effectList: {
    gap: 7,
  },
  effectChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  effectChipSelected: {
    borderColor: "rgba(138,178,255,0.44)",
    backgroundColor: "rgba(34,52,92,0.86)",
  },
  effectChipDisabled: {
    opacity: 0.48,
  },
  effectLabel: {
    color: "#DCE4F5",
    fontSize: 11.5,
    fontWeight: "800",
  },
  effectLabelSelected: {
    color: "#FFFFFF",
  },
  effectStatus: {
    color: "#91A0BC",
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
