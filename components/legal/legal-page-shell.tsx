import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type LegalPageShellProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function LegalPageShell({ eyebrow, title, subtitle, children }: LegalPageShellProps) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <SafeAreaView style={[styles.safeArea, dark ? styles.safeAreaDark : styles.safeAreaLight]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={Platform.OS === "web"}
      >
        <View style={[styles.card, dark ? styles.cardDark : styles.cardLight]}>
          <Text style={[styles.eyebrow, dark ? styles.eyebrowDark : styles.eyebrowLight]}>{eyebrow}</Text>
          <Text style={[styles.title, dark ? styles.titleDark : styles.titleLight]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, dark ? styles.subtitleDark : styles.subtitleLight]}>{subtitle}</Text>
          ) : null}
          <View style={styles.body}>{children}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, dark ? styles.sectionTitleDark : styles.sectionTitleLight]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function LegalParagraph({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return <Text style={[styles.paragraph, dark ? styles.paragraphDark : styles.paragraphLight]}>{children}</Text>;
}

export function LegalList({ items }: { items: string[] }) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Text key={item} style={[styles.listItem, dark ? styles.paragraphDark : styles.paragraphLight]}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export function LegalMeta({ label, value }: { label: string; value: string }) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === "dark";

  return (
    <Text style={[styles.meta, dark ? styles.metaDark : styles.metaLight]}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {value}
    </Text>
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
    backgroundColor: "#121212",
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
  cardLight: {
    backgroundColor: "#FFFDF9",
    borderColor: "#E4D9CA",
  },
  cardDark: {
    backgroundColor: "#1B1B1B",
    borderColor: "#383838",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  eyebrowLight: {
    color: "#8B4A25",
  },
  eyebrowDark: {
    color: "#FFB07A",
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
  },
  titleLight: {
    color: "#1B120D",
  },
  titleDark: {
    color: "#FFF7EF",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12,
  },
  subtitleLight: {
    color: "#5F4A3C",
  },
  subtitleDark: {
    color: "#D6C0B0",
  },
  body: {
    marginTop: 20,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    marginBottom: 10,
  },
  sectionTitleLight: {
    color: "#231711",
  },
  sectionTitleDark: {
    color: "#FFF1E8",
  },
  sectionBody: {
    gap: 10,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
  },
  paragraphLight: {
    color: "#433329",
  },
  paragraphDark: {
    color: "#E6D6CB",
  },
  list: {
    gap: 8,
  },
  listItem: {
    fontSize: 15,
    lineHeight: 24,
  },
  meta: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6,
  },
  metaLight: {
    color: "#5F4A3C",
  },
  metaDark: {
    color: "#D6C0B0",
  },
  metaLabel: {
    fontWeight: "700",
  },
});
