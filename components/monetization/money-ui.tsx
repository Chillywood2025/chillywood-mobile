import React from "react";
import { StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";

import { ProfileMediaImage as Image } from "../ui/ProfileMediaImage";

export type MoneyTone = "neutral" | "premium" | "success" | "warning" | "danger" | "vip";

type MoneyStatusChipProps = {
  label: string;
  tone?: MoneyTone;
  testID?: string;
};

type CreatorMoneyHeaderProps = {
  kicker: string;
  title: string;
  body?: string;
  creatorName?: string;
  imageUrl?: string | null;
  imageSource?: ImageSourcePropType;
  tone?: MoneyTone;
  testID?: string;
};

type MoneyOfferCardProps = {
  kicker?: string;
  title: string;
  body?: string;
  price?: string | null;
  statusLabel?: string;
  statusTone?: MoneyTone;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

type MoneyScopeStripProps = {
  includesTitle?: string;
  includes: string;
  excludesTitle?: string;
  excludes: string;
  includesTestID?: string;
  excludesTestID?: string;
};

type MoneySuccessReceiptProps = {
  title: string;
  body: string;
  testID?: string;
};

const toneAccent: Record<MoneyTone, string> = {
  neutral: "#AEB8CA",
  premium: "#F2C25B",
  success: "#7CE0A3",
  warning: "#F2C25B",
  danger: "#FF7D96",
  vip: "#D8B4FE",
};

const toneBackground: Record<MoneyTone, string> = {
  neutral: "rgba(255,255,255,0.07)",
  premium: "rgba(242,194,91,0.14)",
  success: "rgba(57,217,138,0.14)",
  warning: "rgba(242,194,91,0.14)",
  danger: "rgba(220,20,60,0.18)",
  vip: "rgba(168,85,247,0.16)",
};

export function MoneyStatusChip({ label, tone = "neutral", testID }: MoneyStatusChipProps) {
  return (
    <Text
      testID={testID}
      style={[
        styles.statusChip,
        {
          color: toneAccent[tone],
          backgroundColor: toneBackground[tone],
          borderColor: `${toneAccent[tone]}55`,
        },
      ]}
    >
      {label}
    </Text>
  );
}

export function CreatorMoneyHeader({
  kicker,
  title,
  body,
  creatorName,
  imageUrl,
  imageSource,
  tone = "premium",
  testID,
}: CreatorMoneyHeaderProps) {
  const source = imageSource ?? (imageUrl ? { uri: imageUrl } : null);
  const initial = (creatorName || title || "C").slice(0, 1).toUpperCase();

  return (
    <View
      testID={testID}
      style={[
        styles.creatorHeader,
        {
          borderColor: `${toneAccent[tone]}38`,
          backgroundColor: tone === "vip" ? "rgba(28,18,42,0.92)" : "rgba(15,19,29,0.96)",
        },
      ]}
    >
      <View style={[styles.creatorAvatar, { borderColor: `${toneAccent[tone]}66` }]}>
        {source ? (
          <Image source={source} style={styles.creatorImage} />
        ) : (
          <Text style={styles.creatorInitial}>{initial}</Text>
        )}
      </View>
      <View style={styles.creatorCopy}>
        <Text style={[styles.kicker, { color: toneAccent[tone] }]}>{kicker}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        {creatorName ? <Text style={styles.creatorName}>{creatorName}</Text> : null}
        {body ? <Text style={styles.headerBody}>{body}</Text> : null}
      </View>
    </View>
  );
}

export function MoneyOfferCard({
  kicker,
  title,
  body,
  price,
  statusLabel,
  statusTone = "neutral",
  testID,
  style,
  children,
}: MoneyOfferCardProps) {
  return (
    <View testID={testID} style={[styles.offerCard, style]}>
      <View style={styles.offerTopRow}>
        {kicker ? <Text style={[styles.kicker, { color: toneAccent[statusTone] }]}>{kicker}</Text> : <View />}
        {statusLabel ? <MoneyStatusChip label={statusLabel} tone={statusTone} /> : null}
      </View>
      <Text style={styles.offerTitle}>{title}</Text>
      {price ? <Text style={styles.offerPrice}>{price}</Text> : null}
      {body ? <Text style={styles.offerBody}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function MoneyScopeStrip({
  includesTitle = "Includes",
  includes,
  excludesTitle = "Does not include",
  excludes,
  includesTestID,
  excludesTestID,
}: MoneyScopeStripProps) {
  return (
    <View style={styles.scopeGrid}>
      <View style={styles.scopeCard} testID={includesTestID}>
        <Text style={styles.scopeTitle}>{includesTitle}</Text>
        <Text style={styles.scopeBody}>{includes}</Text>
      </View>
      <View style={[styles.scopeCard, styles.scopeCardMuted]} testID={excludesTestID}>
        <Text style={styles.scopeTitle}>{excludesTitle}</Text>
        <Text style={styles.scopeBody}>{excludes}</Text>
      </View>
    </View>
  );
}

export function MoneySuccessReceipt({ title, body, testID }: MoneySuccessReceiptProps) {
  return (
    <View style={styles.successReceipt} testID={testID}>
      <Text style={styles.successTitle}>{title}</Text>
      <Text style={styles.successBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  creatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
  },
  creatorAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#20283A",
  },
  creatorImage: {
    width: "100%",
    height: "100%",
  },
  creatorInitial: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  creatorCopy: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: "#F8FAFF",
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
  },
  creatorName: {
    color: "#D6DEEF",
    fontSize: 13,
    fontWeight: "900",
  },
  headerBody: {
    color: "#AEB8CA",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  offerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,25,0.96)",
    padding: 15,
    gap: 9,
  },
  offerTopRow: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  offerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  offerPrice: {
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
  },
  offerBody: {
    color: "#D6DEEF",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "700",
  },
  statusChip: {
    overflow: "hidden",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: "900",
  },
  scopeGrid: {
    gap: 10,
  },
  scopeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(124,224,163,0.22)",
    backgroundColor: "rgba(57,217,138,0.08)",
    padding: 12,
    gap: 5,
  },
  scopeCardMuted: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  scopeTitle: {
    color: "#F8FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
  scopeBody: {
    color: "#B8C4D8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  successReceipt: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(124,224,163,0.28)",
    backgroundColor: "rgba(18,66,43,0.78)",
    padding: 13,
    gap: 5,
  },
  successTitle: {
    color: "#D8FFEA",
    fontSize: 14,
    fontWeight: "900",
  },
  successBody: {
    color: "#DDF7E8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
});
