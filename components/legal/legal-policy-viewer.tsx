import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { type LegalPolicy } from "../../_lib/legalPolicies";

type LegalPolicyViewerProps = {
  policy: LegalPolicy;
};

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function LegalPolicyViewer({ policy }: LegalPolicyViewerProps) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(policy.sections.map((section) => [section.heading, true])),
  );
  const normalizedQuery = normalize(query);

  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return policy.sections;
    return policy.sections.filter((section) => (
      normalize(section.heading).includes(normalizedQuery)
      || section.paragraphs.some((paragraph) => normalize(paragraph).includes(normalizedQuery))
    ));
  }, [normalizedQuery, policy.sections]);

  const toggleSection = (heading: string) => {
    setExpanded((current) => ({ ...current, [heading]: !current[heading] }));
  };

  return (
    <SafeAreaView style={[styles.safeArea, dark ? styles.safeAreaDark : styles.safeAreaLight]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={Platform.OS === "web"}
      >
        <View style={[styles.hero, dark ? styles.heroDark : styles.heroLight]}>
          <Text style={[styles.eyebrow, dark ? styles.eyebrowDark : styles.eyebrowLight]}>Chi&apos;llywood Legal</Text>
          <Text style={[styles.title, dark ? styles.titleDark : styles.titleLight]}>{policy.title}</Text>
          <Text style={[styles.summary, dark ? styles.summaryDark : styles.summaryLight]}>{policy.summary}</Text>
          <View style={styles.metaGrid}>
            <View style={[styles.metaTile, dark ? styles.metaTileDark : styles.metaTileLight]}>
              <Text style={[styles.metaLabel, dark ? styles.metaLabelDark : styles.metaLabelLight]}>Effective</Text>
              <Text style={[styles.metaValue, dark ? styles.metaValueDark : styles.metaValueLight]}>{policy.effectiveDate}</Text>
            </View>
            <View style={[styles.metaTile, dark ? styles.metaTileDark : styles.metaTileLight]}>
              <Text style={[styles.metaLabel, dark ? styles.metaLabelDark : styles.metaLabelLight]}>Version</Text>
              <Text style={[styles.metaValue, dark ? styles.metaValueDark : styles.metaValueLight]}>{policy.version}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.toolPanel, dark ? styles.panelDark : styles.panelLight]}>
          <Text style={[styles.panelTitle, dark ? styles.panelTitleDark : styles.panelTitleLight]}>Find a Section</Text>
          <TextInput
            style={[styles.searchInput, dark ? styles.searchInputDark : styles.searchInputLight]}
            placeholder="Search this policy"
            placeholderTextColor={dark ? "#8F98A8" : "#71685F"}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tocRow}>
            {policy.sections.map((section) => (
              <TouchableOpacity
                key={section.heading}
                style={[styles.tocChip, expanded[section.heading] && styles.tocChipActive]}
                activeOpacity={0.84}
                onPress={() => setExpanded((current) => ({ ...current, [section.heading]: true }))}
              >
                <Text
                  style={[
                    styles.tocChipText,
                    dark ? styles.tocChipTextDark : styles.tocChipTextLight,
                    expanded[section.heading] && (dark ? styles.tocChipTextActiveDark : styles.tocChipTextActiveLight),
                  ]}
                  numberOfLines={1}
                >
                  {section.heading}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {visibleSections.length === 0 ? (
          <View style={[styles.emptyCard, dark ? styles.panelDark : styles.panelLight]}>
            <Text style={[styles.emptyTitle, dark ? styles.panelTitleDark : styles.panelTitleLight]}>No matching section</Text>
            <Text style={[styles.emptyBody, dark ? styles.paragraphDark : styles.paragraphLight]}>
              Try a different word or clear the search field.
            </Text>
          </View>
        ) : (
          <View style={styles.sectionList}>
            {visibleSections.map((section) => {
              const isExpanded = expanded[section.heading] ?? true;
              return (
                <View key={section.heading} style={[styles.sectionCard, dark ? styles.panelDark : styles.panelLight]}>
                  <TouchableOpacity
                    style={styles.sectionHeader}
                    activeOpacity={0.82}
                    onPress={() => toggleSection(section.heading)}
                  >
                    <Text style={[styles.sectionTitle, dark ? styles.sectionTitleDark : styles.sectionTitleLight]}>
                      {section.heading}
                    </Text>
                    <Text style={[styles.expandLabel, dark ? styles.expandLabelDark : styles.expandLabelLight]}>
                      {isExpanded ? "Hide" : "Read"}
                    </Text>
                  </TouchableOpacity>
                  {isExpanded ? (
                    <View style={styles.paragraphStack}>
                      {section.paragraphs.map((text, index) => (
                        <Text key={`${section.heading}-${index}`} style={[styles.paragraph, dark ? styles.paragraphDark : styles.paragraphLight]}>
                          {text}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  safeAreaLight: {
    backgroundColor: "#F4EFE7",
  },
  safeAreaDark: {
    backgroundColor: "#0D0F14",
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  heroLight: {
    backgroundColor: "#FFFDF9",
    borderColor: "#E5D7C7",
  },
  heroDark: {
    backgroundColor: "#171A22",
    borderColor: "rgba(255,255,255,0.1)",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  eyebrowLight: {
    color: "#8B4A25",
  },
  eyebrowDark: {
    color: "#FFB07A",
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginTop: 10,
  },
  titleLight: {
    color: "#1B120D",
  },
  titleDark: {
    color: "#FFF8F0",
  },
  summary: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
  },
  summaryLight: {
    color: "#5A473B",
  },
  summaryDark: {
    color: "#D6DEEA",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  metaTile: {
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaTileLight: {
    backgroundColor: "#F7EFE5",
    borderColor: "#E3D2BE",
  },
  metaTileDark: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaLabelLight: {
    color: "#7A5C49",
  },
  metaLabelDark: {
    color: "#AEB7C7",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  metaValueLight: {
    color: "#24160E",
  },
  metaValueDark: {
    color: "#FFFFFF",
  },
  toolPanel: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  panelLight: {
    backgroundColor: "#FFFDF9",
    borderColor: "#E5D7C7",
  },
  panelDark: {
    backgroundColor: "#151820",
    borderColor: "rgba(255,255,255,0.09)",
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: "900",
  },
  panelTitleLight: {
    color: "#24160E",
  },
  panelTitleDark: {
    color: "#FFFFFF",
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    marginTop: 10,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  searchInputLight: {
    backgroundColor: "#F7EFE5",
    borderColor: "#E3D2BE",
    color: "#24160E",
  },
  searchInputDark: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderColor: "rgba(255,255,255,0.08)",
    color: "#FFFFFF",
  },
  tocRow: {
    gap: 8,
    paddingTop: 12,
  },
  tocChip: {
    borderColor: "rgba(220,20,60,0.3)",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: "center",
    maxWidth: 220,
    paddingHorizontal: 12,
  },
  tocChipActive: {
    backgroundColor: "rgba(220,20,60,0.16)",
    borderColor: "rgba(255,76,114,0.8)",
  },
  tocChipText: {
    fontSize: 13,
    fontWeight: "800",
  },
  tocChipTextLight: {
    color: "#8A3D57",
  },
  tocChipTextDark: {
    color: "#AEB7C7",
  },
  tocChipTextActiveLight: {
    color: "#7D1E3A",
  },
  tocChipTextActiveDark: {
    color: "#FFF2F5",
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    marginTop: 8,
  },
  sectionList: {
    gap: 12,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 44,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  sectionTitleLight: {
    color: "#24160E",
  },
  sectionTitleDark: {
    color: "#FFF8F0",
  },
  expandLabel: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7,
    textTransform: "uppercase",
  },
  expandLabelLight: {
    backgroundColor: "#F7EFE5",
    color: "#8B4A25",
  },
  expandLabelDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#FFB7C6",
  },
  paragraphStack: {
    gap: 12,
    marginTop: 10,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
  },
  paragraphLight: {
    color: "#433329",
  },
  paragraphDark: {
    color: "#E5EAF3",
  },
});
