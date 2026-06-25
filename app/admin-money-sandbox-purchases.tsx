import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { hasPlatformRoleMembership, readMyPlatformRoleMemberships } from "../_lib/moderation";
import { resolveInternalTesterSandboxPurchaseMode } from "../_lib/monetization";
import {
  purchaseRevenueCatStoreProduct,
  readRevenueCatNonSubscriptionProducts,
  syncRevenueCatCustomerIdentity,
} from "../_lib/revenuecat";
import { SUPABASE_URL, supabase } from "../_lib/supabase";
import { MoneyScopeInfoButton, type MoneyScopeKey } from "../components/monetization/MoneyScopeInfoButton";

type SandboxProductKey =
  | "paid_content_access_sandbox_099"
  | "watch_party_live_ticket_sandbox_099"
  | "live_watch_party_access_pass_sandbox_099"
  | "live_watch_party_seat_pass_sandbox_099"
  | "creator_tip_sandbox_099"
  | "event_pass_sandbox_099";

type SandboxProduct = {
  key: SandboxProductKey;
  label: string;
  sourceType: string;
  providerProductId: string;
};

const SANDBOX_PRODUCTS: SandboxProduct[] = [
  {
    key: "watch_party_live_ticket_sandbox_099",
    label: "Watch-Party Live Seat Pass",
    sourceType: "watch_party_live",
    providerProductId: "cw_watch_party_live_ticket_sandbox_099",
  },
  {
    key: "live_watch_party_access_pass_sandbox_099",
    label: "Live Watch-Party access pass",
    sourceType: "live_watch_party_access",
    providerProductId: "cw_live_watch_party_access_sandbox_099",
  },
  {
    key: "live_watch_party_seat_pass_sandbox_099",
    label: "Live Watch-Party seat pass",
    sourceType: "live_watch_party_seat",
    providerProductId: "cw_live_watch_party_seat_sandbox_099",
  },
  {
    key: "paid_content_access_sandbox_099",
    label: "Paid content access",
    sourceType: "paid_content",
    providerProductId: "cw_paid_content_access_sandbox_099",
  },
  {
    key: "creator_tip_sandbox_099",
    label: "Creator tip",
    sourceType: "creator_tip",
    providerProductId: "cw_creator_tip_sandbox_099",
  },
  {
    key: "event_pass_sandbox_099",
    label: "Event pass",
    sourceType: "event",
    providerProductId: "cw_event_pass_sandbox_099",
  },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SANDBOX_EVENT_PASS_PROOF_SOURCE_ID = "9b2f4e7d-2e8e-4d2f-93ef-40b06d317004";
const SANDBOX_MERCH_PRODUCT_KEY = "cw_merch_test_tee_sandbox";
const STRIPE_MERCH_CHECKOUT_URL = `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/stripe-merch-checkout`;

const scopeForSandboxProduct = (product: SandboxProduct): MoneyScopeKey => {
  if (product.sourceType === "watch_party_live") return "watch_party_ticket";
  if (product.sourceType === "live_watch_party_access") return "live_watch_party_access_pass";
  if (product.sourceType === "live_watch_party_seat") return "live_watch_party_seat_pass";
  if (product.sourceType === "paid_content") return "paid_creator_video";
  if (product.sourceType === "creator_tip") return "creator_tip";
  if (product.sourceType === "event") return "event_pass";
  return "paid_creator_video";
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

export default function AdminMoneySandboxPurchasesScreen() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accessSummary, setAccessSummary] = useState("Checking internal tester sandbox access...");
  const [userId, setUserId] = useState("");
  const [selectedKey, setSelectedKey] = useState<SandboxProductKey>("watch_party_live_ticket_sandbox_099");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState("Sandbox purchase proof is idle.");
  const [merchStatus, setMerchStatus] = useState("Stripe physical merch sandbox checkout is idle.");
  const [busy, setBusy] = useState(false);
  const [merchBusy, setMerchBusy] = useState(false);

  const selectedProduct = useMemo(
    () => SANDBOX_PRODUCTS.find((entry) => entry.key === selectedKey) ?? SANDBOX_PRODUCTS[0],
    [selectedKey],
  );

  useEffect(() => {
    let mounted = true;

    const loadAccess = async () => {
      const [{ data: userData }, memberships] = await Promise.all([
        supabase.auth.getUser(),
        readMyPlatformRoleMemberships().catch(() => []),
      ]);
      if (!mounted) return;
      const currentUserId = normalizeText(userData.user?.id);
      const sandboxMode = await resolveInternalTesterSandboxPurchaseMode({
        userId: currentUserId,
        email: userData.user?.email ?? null,
      });
      if (!mounted) return;
      setUserId(currentUserId);
      const ownerOperator = hasPlatformRoleMembership(memberships, ["owner", "operator"]);
      setAllowed(ownerOperator || sandboxMode.enabled);
      setAccessSummary(ownerOperator
        ? "Owner/operator sandbox proof mode is active."
        : sandboxMode.enabled
          ? "Approved internal tester sandbox mode is active."
          : sandboxMode.reason);
      setLoading(false);
    };

    void loadAccess();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedProduct.sourceType === "creator_tip" && userId) {
      setSourceId((current) => current || userId);
    }
  }, [selectedProduct.sourceType, userId]);

  useEffect(() => {
    if (selectedProduct.sourceType === "event") {
      setSourceId(SANDBOX_EVENT_PASS_PROOF_SOURCE_ID);
    }
  }, [selectedProduct.sourceType]);

  const runSandboxPurchase = useCallback(async () => {
    if (!allowed || busy) return;
    const safeSourceId = normalizeText(sourceId);
    if (!UUID_PATTERN.test(safeSourceId)) {
      Alert.alert("Source required", "Enter a real source UUID before starting a sandbox purchase.");
      return;
    }

    setBusy(true);
    setStatus(`Creating sandbox intent for ${selectedProduct.label}...`);

    try {
      if (userId) {
        await syncRevenueCatCustomerIdentity(userId);
      }

      const { data: intent, error: intentError } = await supabase.rpc("create_money_purchase_intent", {
        p_product_key: selectedProduct.key,
        p_source_type: selectedProduct.sourceType,
        p_source_id: safeSourceId,
        p_metadata: {
          proof_surface: "admin_money_sandbox_purchases",
          sandbox_only: true,
          not_payable: true,
        },
      });

      if (intentError) throw intentError;

      setStatus(`Intent created. Loading RevenueCat product ${selectedProduct.providerProductId}...`);
      const products = await readRevenueCatNonSubscriptionProducts([selectedProduct.providerProductId]);
      const storeProduct = products.find((entry) => normalizeText(entry.identifier) === selectedProduct.providerProductId);
      if (!storeProduct) {
        throw new Error(`RevenueCat product ${selectedProduct.providerProductId} is not available on this build/account.`);
      }

      setStatus("Opening Google Play sandbox purchase...");
      const result = await purchaseRevenueCatStoreProduct(storeProduct);
      const intentId = normalizeText((intent as { id?: unknown } | null)?.id);
      const purchasedProductId = normalizeText(result.productIdentifier) || selectedProduct.providerProductId;
      setStatus(
        [
          "Sandbox purchase completed.",
          `Product: ${purchasedProductId}`,
          intentId ? `Intent: ${intentId}` : "Intent: created",
          "Webhook processing may take a moment. Refresh Owner/Admin Money Center for provider event, access grant, and sandbox not-payable ledger proof.",
        ].join("\n"),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sandbox purchase could not be completed.";
      setStatus(message);
      Alert.alert("Sandbox purchase stopped", message);
    } finally {
      setBusy(false);
    }
  }, [allowed, busy, selectedProduct, sourceId, userId]);

  const runMerchSandboxCheckout = useCallback(async () => {
    if (!allowed || merchBusy) return;
    setMerchBusy(true);
    setMerchStatus("Creating Stripe sandbox Checkout session for physical merch...");

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error("Sign in again before starting Stripe physical merch sandbox checkout.");
      }
      const response = await fetch(STRIPE_MERCH_CHECKOUT_URL, {
        body: JSON.stringify({
          product_key: SANDBOX_MERCH_PRODUCT_KEY,
          quantity: 1,
        }),
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const safeMessage = normalizeText((data as { message?: unknown } | null)?.message) || "Stripe physical merch sandbox checkout could not be created.";
        throw new Error(safeMessage);
      }
      const payload = data as { message?: string; url?: string; orderId?: string; checkoutCreated?: boolean; physicalMerchOnly?: boolean } | null;
      const checkoutUrl = normalizeText(payload?.url);
      if (!payload?.checkoutCreated || !checkoutUrl) {
        throw new Error(payload?.message || "Stripe sandbox checkout did not return a checkout URL.");
      }

      setMerchStatus(
        [
          "Stripe sandbox Checkout session created.",
          `Order: ${normalizeText(payload.orderId) || "created"}`,
          "Physical merch only. No digital access, RevenueCat entitlement, Premium entitlement, payout, cash-out, withdrawal, transfer, or payable balance was created.",
        ].join("\n"),
      );
      await Linking.openURL(checkoutUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe merch sandbox checkout could not be created.";
      setMerchStatus(message);
      Alert.alert("Merch sandbox checkout stopped", message);
    } finally {
      setMerchBusy(false);
    }
  }, [allowed, merchBusy]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading sandbox proof access...</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Sandbox tester access required</Text>
        <Text style={styles.body}>
          This sandbox purchase proof surface is limited to active Owner/Admin accounts or approved internal tester sandbox accounts.
        </Text>
        <Text style={styles.body}>{accessSummary}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Internal test mode / Sandbox only / Not payable</Text>
      <Text style={styles.title}>Sandbox Purchase Testing</Text>
      <Text style={styles.body}>
        Approved testers can start real sandbox purchases for digital access and physical merch. This screen cannot activate
        production money, payout execution, cash-out, withdrawal, transfer, payable balances, LiveKit publish authority, host
        power, speaker authority, moderator power, or admin power.
      </Text>
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>
          {accessSummary} Sandbox rows stay not payable. Production money and payouts stay off.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sandbox mode status</Text>
        <View style={styles.controlGrid}>
          {[
            ["Internal tester sandbox mode", "Active for this account"],
            ["Live money", "Off"],
            ["Payouts", "Off"],
            ["Production money", "Off"],
            ["Payable sandbox rows", "0 expected"],
            ["Stripe Android digital checkout", "Absent"],
          ].map(([label, value]) => (
            <View key={label} style={styles.controlRow}>
              <Text style={styles.controlLabel}>{label}</Text>
              <Text style={styles.controlValue}>{value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Premium</Text>
        <Text style={styles.body}>
          Use the Premium screen for the Google Play / RevenueCat sandbox subscription test and restore path. Public/default
          accounts still see Premium unavailable while the purchase shell is on hold.
        </Text>
        <MoneyScopeInfoButton scope="premium" label="What does Premium unlock?" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Digital access products</Text>
        <Text style={styles.label}>Product</Text>
        <View style={styles.productGrid}>
          {SANDBOX_PRODUCTS.map((product) => {
            const selected = product.key === selectedKey;
            return (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                key={product.key}
                onPress={() => setSelectedKey(product.key)}
                style={[styles.productButton, selected ? styles.productButtonSelected : null]}
              >
                <Text style={[styles.productButtonText, selected ? styles.productButtonTextSelected : null]}>
                  {product.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Provider product</Text>
        <Text style={styles.codeText}>{selectedProduct.providerProductId}</Text>
        <Text style={styles.label}>Source type</Text>
        <Text style={styles.codeText}>{selectedProduct.sourceType}</Text>
        <MoneyScopeInfoButton scope={scopeForSandboxProduct(selectedProduct)} label="What does this unlock?" />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Source UUID</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onChangeText={setSourceId}
          placeholder="content, room, creator, or event UUID"
          placeholderTextColor="#7a7f89"
          style={styles.input}
          value={sourceId}
        />
        <Text style={styles.hint}>
          Use a real source UUID. Creator tip defaults to the signed-in user id when available. Access still depends on safety,
          privacy, moderation, host approval, and resolver policy.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={runSandboxPurchase}
        style={[styles.primaryButton, busy ? styles.primaryButtonDisabled : null]}
      >
        <Text style={styles.primaryButtonText}>{busy ? "Running sandbox proof..." : "Start real sandbox purchase"}</Text>
      </Pressable>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Physical merch</Text>
        <Text style={styles.body}>
          Stripe sandbox checkout is physical merch only. It does not create app access, RevenueCat entitlement, Premium
          entitlement, creator payout eligibility, or real fulfillment.
        </Text>
        <MoneyScopeInfoButton scope="merch_physical_good" label="What does merch include?" />
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            Product: {SANDBOX_MERCH_PRODUCT_KEY}{"\n"}
            Mode: Stripe test/sandbox{"\n"}
            Payable state: Not payable
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={merchBusy}
          onPress={runMerchSandboxCheckout}
          style={[styles.primaryButton, merchBusy ? styles.primaryButtonDisabled : null]}
        >
          <Text style={styles.primaryButtonText}>{merchBusy ? "Creating Stripe sandbox session..." : "Start physical merch sandbox checkout"}</Text>
        </Pressable>
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{merchStatus}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payout readiness</Text>
        <Text style={styles.body}>
          Stripe Connect payout readiness is read-only here. Internal testers cannot request, trigger, simulate, cash out,
          withdraw, transfer, or activate payouts. KYC/tax/provider status can be inspected in Money Center only as readiness.
        </Text>
        <MoneyScopeInfoButton scope="payout_readiness" label="What does payout setup mean?" />
        <View style={styles.controlGrid}>
          {[
            ["Stripe Connect", "Readiness only"],
            ["Payout execution", "Blocked"],
            ["Cash-out", "Absent"],
            ["Withdrawal", "Absent"],
            ["Transfer", "Absent"],
            ["Payable balance", "Not shown"],
          ].map(([label, value]) => (
            <View key={label} style={styles.controlRow}>
              <Text style={styles.controlLabel}>{label}</Text>
              <Text style={styles.controlValue}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#d5d9e1",
    fontSize: 14,
    lineHeight: 20,
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#10131a",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  codeText: {
    color: "#f2f5f9",
    fontFamily: "SpaceMono",
    fontSize: 13,
    marginBottom: 12,
  },
  container: {
    backgroundColor: "#10131a",
    gap: 18,
    minHeight: "100%",
    padding: 20,
    paddingBottom: 48,
  },
  controlGrid: {
    gap: 8,
  },
  controlLabel: {
    color: "#9aa3af",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  controlRow: {
    alignItems: "center",
    backgroundColor: "#171c26",
    borderColor: "#303746",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  controlValue: {
    color: "#f2f5f9",
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
  },
  hint: {
    color: "#9aa3af",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#171c26",
    borderColor: "#303746",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f2f5f9",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  kicker: {
    color: "#9bd2ff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  label: {
    color: "#9aa3af",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#e4edf8",
    borderRadius: 8,
    padding: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#10131a",
    fontSize: 14,
    fontWeight: "800",
  },
  productButton: {
    borderColor: "#303746",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  productButtonSelected: {
    backgroundColor: "#213149",
    borderColor: "#7bb8ff",
  },
  productButtonText: {
    color: "#d5d9e1",
    fontSize: 13,
    fontWeight: "700",
  },
  productButtonTextSelected: {
    color: "#ffffff",
  },
  productGrid: {
    gap: 8,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
  },
  statusBox: {
    backgroundColor: "#171c26",
    borderColor: "#303746",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  statusText: {
    color: "#d5d9e1",
    fontSize: 13,
    lineHeight: 19,
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800",
  },
});
