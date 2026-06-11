import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { trackEvent } from "../_lib/analytics";
import { formatMonetizationCurrency } from "../_lib/creatorMonetization";
import { readMyTipTransactionStatus } from "../_lib/creatorTips";

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

export default function TipStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tip_id?: string | string[]; tipId?: string | string[] }>();
  const tipId = normalizeParam(params.tip_id ?? params.tipId);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let attempts = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (!tipId) {
        setError("Tip status could not be loaded.");
        setLoading(false);
        return;
      }

      attempts += 1;
      try {
        const nextStatus = await readMyTipTransactionStatus(tipId);
        if (!active) return;
        setStatus(nextStatus);
        setLoading(false);
        const currentStatus = String(nextStatus.status ?? "").trim();
        if (currentStatus === "paid") {
          trackEvent("tip_payment_succeeded", {
            creator_id: String(nextStatus.creatorId ?? ""),
            feature_key: "tips",
            offer_type: "tip",
            route_name: "tip-status",
            source_surface: "stripe_checkout_return",
          });
          return;
        }
        if (["failed", "canceled", "refunded", "disputed"].includes(currentStatus)) return;
        if (attempts < 8) timeout = setTimeout(poll, 1800);
      } catch {
        if (!active) return;
        setError("Unable to confirm this tip right now.");
        setLoading(false);
      }
    };

    void poll();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [tipId]);

  const presentation = useMemo(() => {
    const currentStatus = String(status?.status ?? "").trim();
    if (loading || currentStatus === "pending" || currentStatus === "checkout_started") {
      return {
        title: "Confirming tip...",
        body: "Stripe is confirming the test payment. This can take a moment.",
        tone: "pending" as const,
      };
    }
    if (currentStatus === "paid") {
      return {
        title: "Tip sent",
        body: "Your tip was verified. It did not unlock content, badges, room access, VIP, or perks.",
        tone: "success" as const,
      };
    }
    if (currentStatus === "canceled") {
      return {
        title: "Tip canceled",
        body: "No tip was sent and no creator earnings were credited.",
        tone: "muted" as const,
      };
    }
    if (currentStatus === "failed") {
      return {
        title: "Tip failed",
        body: "The payment did not complete. No tip was credited.",
        tone: "error" as const,
      };
    }
    return {
      title: error || "Tip status unavailable",
      body: "No content, badge, VIP, room access, or perk was unlocked.",
      tone: "error" as const,
    };
  }, [error, loading, status?.status]);

  const amountCents = Number(status?.amountCents ?? 0);
  const currency = String(status?.currency ?? "usd");

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        {presentation.tone === "pending" ? <ActivityIndicator color="#DC143C" /> : null}
        <Text style={[styles.title, presentation.tone === "success" && styles.titleSuccess]}>{presentation.title}</Text>
        {amountCents > 0 ? (
          <Text style={styles.amount}>{formatMonetizationCurrency(amountCents, currency)}</Text>
        ) : null}
        <Text style={styles.body}>{presentation.body}</Text>
        <TouchableOpacity style={styles.button} activeOpacity={0.86} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#07080D",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#111722",
    padding: 24,
    alignItems: "center",
    gap: 14,
  },
  title: {
    color: "#F8FAFF",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  titleSuccess: {
    color: "#BFF6D0",
  },
  amount: {
    color: "#F8FAFF",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
  },
  body: {
    color: "#B8C4D8",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  button: {
    minHeight: 50,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#DC143C",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
});
