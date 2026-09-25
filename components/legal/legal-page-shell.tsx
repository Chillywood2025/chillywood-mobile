import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChillywoodBrandedSurface,
  ChillywoodGlassPanel,
} from "../ui/chillywood-branded-surface";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function LegalPageShell({ eyebrow, title, subtitle, children }: LegalPageShellProps) {
  return (
    <ChillywoodBrandedSurface style={styles.safeArea} variant="legal">
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={Platform.OS === "web"}
        >
          <ChillywoodGlassPanel style={styles.card} variant="legal">
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.body}>{children}</View>
          </ChillywoodGlassPanel>
        </ScrollView>
      </SafeAreaView>
    </ChillywoodBrandedSurface>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function LegalParagraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Text key={item} style={styles.listItem}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export function LegalMeta({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.meta}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 860,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
  },
  eyebrow: {
    color: "#D2CFE2",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
  },
  subtitle: {
    color: "#B7B3C7",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  body: {
    marginTop: 20,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    color: "#EAE7FF",
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    marginBottom: 10,
  },
  sectionBody: {
    gap: 10,
  },
  paragraph: {
    color: "#D2CFE2",
    fontSize: 15,
    lineHeight: 24,
  },
  list: {
    gap: 8,
  },
  listItem: {
    color: "#D2CFE2",
    fontSize: 15,
    lineHeight: 24,
  },
  meta: {
    color: "#B7B3C7",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  metaLabel: {
    fontWeight: "700",
  },
});
