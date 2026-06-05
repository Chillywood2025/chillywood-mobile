import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import {
  APPROVED_CREATOR_SANDBOX_TIERS,
  CREATOR_MONETIZATION_SETUP_POLICY,
  adminListCreatorSandboxMonetizationConfigs,
  getCreatorSandboxTier,
  isValidCreatorMonetizationSourceId,
  launchCreatorMerchSandboxCheckout,
  launchCreatorSandboxDigitalPurchase,
  listMyCreatorSandboxMonetizationConfigs,
  saveCreatorSandboxMonetizationConfig,
  type CreatorMonetizationConfig,
  type CreatorMonetizationSetupSourceType,
} from "../_lib/creatorMonetizationSetup";
import { hasPlatformRoleMembership, readMyPlatformRoleMemberships, type PlatformRoleMembership } from "../_lib/moderation";
import { resolveInternalTesterSandboxPurchaseMode } from "../_lib/monetization";
import { useSession } from "../_lib/session";
import { AppActionButton, AppEmptyState, AppSection, AppStatusPill } from "../components/ui/app-surface";

const DEFAULT_EVENT_PASS_PROOF_SOURCE_ID = "9b2f4e7d-2e8e-4d2f-93ef-40b06d317004";

const sourceCopy: Record<CreatorMonetizationSetupSourceType, { label: string; placeholder: string; helper: string }> = {
  creator_tip: {
    helper: "Creator tips bind to the creator user id. Tips are ledger-only and not payable.",
    label: "Creator UUID",
    placeholder: "creator user UUID",
  },
  event: {
    helper: "Event passes allow viewing/entry only while the event remains active and allowed.",
    label: "Event UUID",
    placeholder: "event UUID",
  },
  live_watch_party_access: {
    helper: "Access passes allow viewer/listener entry only. They do not grant speaker authority.",
    label: "Live Watch-Party UUID",
    placeholder: "live room UUID",
  },
  live_watch_party_seat: {
    helper: "Seat passes create eligibility only. Host approval is still required before publish.",
    label: "Live Watch-Party UUID",
    placeholder: "live room UUID",
  },
  merch_physical_good: {
    helper: "Physical merch uses Stripe sandbox only and never unlocks app access.",
    label: "Merch product UUID",
    placeholder: "physical merch source UUID",
  },
  paid_content: {
    helper: "Paid access unlocks content only if the content remains public and safe.",
    label: "Content UUID",
    placeholder: "creator video/content UUID",
  },
  watch_party_live: {
    helper: "Tickets grant viewer entry only. Host approval still controls speaker authority.",
    label: "Watch-Party UUID",
    placeholder: "watch-party room UUID",
  },
};

const toText = (value: unknown) => String(value ?? "").trim();

export default function CreatorMonetizationSetupScreen() {
  const router = useRouter();
  const { isLoading, isSignedIn, user } = useSession();
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [accessSummary, setAccessSummary] = useState("Checking sandbox setup access...");
  const [roles, setRoles] = useState<PlatformRoleMembership[]>([]);
  const [selectedKey, setSelectedKey] = useState(APPROVED_CREATOR_SANDBOX_TIERS[0].key);
  const [sourceId, setSourceId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [configs, setConfigs] = useState<CreatorMonetizationConfig[]>([]);
  const [adminConfigs, setAdminConfigs] = useState<CreatorMonetizationConfig[]>([]);
  const [status, setStatus] = useState("No creator sandbox config has been saved in this session.");
  const [busy, setBusy] = useState<"save" | "launch" | "refresh" | null>(null);

  const selectedTier = useMemo(() => getCreatorSandboxTier(selectedKey), [selectedKey]);
  const ownerOperator = useMemo(() => hasPlatformRoleMembership(roles, ["owner", "operator"]), [roles]);
  const selectedSourceCopy = sourceCopy[selectedTier.sourceType];
  const selectedConfig = useMemo(
    () => configs.find((config) => config.productKey === selectedTier.key && config.sourceId === sourceId),
    [configs, selectedTier.key, sourceId],
  );

  const refreshConfigs = useCallback(async () => {
    setBusy((current) => current ?? "refresh");
    try {
      const mine = await listMyCreatorSandboxMonetizationConfigs().catch(() => []);
      setConfigs(mine);
      if (ownerOperator) {
        const adminRows = await adminListCreatorSandboxMonetizationConfigs().catch(() => []);
        setAdminConfigs(adminRows);
      } else {
        setAdminConfigs([]);
      }
    } finally {
      setBusy((current) => current === "refresh" ? null : current);
    }
  }, [ownerOperator]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (isLoading) return;
      if (!isSignedIn || !user?.id) {
        setAllowed(false);
        setAccessSummary("Sign in with an approved creator/internal tester account.");
        setLoadingAccess(false);
        return;
      }
      const [memberships, sandboxMode] = await Promise.all([
        readMyPlatformRoleMemberships().catch(() => []),
        resolveInternalTesterSandboxPurchaseMode({ email: user.email ?? null, userId: user.id }).catch(() => null),
      ]);
      if (!mounted) return;
      setRoles(memberships);
      const hasOwnerOperator = hasPlatformRoleMembership(memberships, ["owner", "operator"]);
      const nextAllowed = hasOwnerOperator || sandboxMode?.enabled === true;
      setAllowed(nextAllowed);
      setAccessSummary(hasOwnerOperator
        ? "Owner/operator sandbox creator setup mode is active."
        : sandboxMode?.enabled
          ? "Approved internal tester sandbox creator setup mode is active."
          : sandboxMode?.reason ?? "This account is not approved for creator sandbox setup.");
      setSourceId((current) => current || user.id);
      setLoadingAccess(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [isLoading, isSignedIn, user?.email, user?.id]);

  useEffect(() => {
    if (!allowed) return;
    void refreshConfigs();
  }, [allowed, refreshConfigs]);

  useEffect(() => {
    if (selectedTier.sourceType === "creator_tip" && user?.id) setSourceId(user.id);
    if (selectedTier.sourceType === "event") setSourceId(DEFAULT_EVENT_PASS_PROOF_SOURCE_ID);
    if (selectedTier.sourceType !== "creator_tip" && selectedTier.sourceType !== "event") setSourceId("");
    setDisplayName(selectedTier.label);
  }, [selectedTier.key, selectedTier.label, selectedTier.sourceType, user?.id]);

  const handleSave = useCallback(async () => {
    if (!allowed || busy) return;
    const safeSourceId = toText(sourceId);
    if (!isValidCreatorMonetizationSourceId(safeSourceId)) {
      Alert.alert("Source UUID required", "Enter a real content, room, event, creator, or merch source UUID before saving.");
      return;
    }
    setBusy("save");
    setStatus(`Saving ${selectedTier.label} sandbox config...`);
    try {
      const config = await saveCreatorSandboxMonetizationConfig({
        displayName: displayName || selectedTier.label,
        metadata: {
          rail: selectedTier.providerRail,
          setup_screen: "creator_monetization_setup",
          unlocks: selectedTier.unlocks,
          safety: selectedTier.safety,
        },
        productKey: selectedTier.key,
        sourceId: safeSourceId,
        sourceType: selectedTier.sourceType,
      });
      setStatus([
        "Sandbox creator config saved.",
        `Product: ${config.providerProductId}`,
        `Source: ${config.sourceType} / ${config.sourceId}`,
        "Sandbox only / Not payable. Production money and payouts remain off.",
      ].join("\n"));
      await refreshConfigs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Creator sandbox config could not be saved.";
      setStatus(message);
      Alert.alert("Save stopped", message);
    } finally {
      setBusy(null);
    }
  }, [allowed, busy, displayName, refreshConfigs, selectedTier, sourceId]);

  const handleLaunch = useCallback(async (config: CreatorMonetizationConfig) => {
    if (!allowed || busy || !user?.id) return;
    setBusy("launch");
    setStatus(`Launching ${config.displayName} sandbox flow...`);
    try {
      if (config.productType === "merch_physical_good") {
        const result = await launchCreatorMerchSandboxCheckout();
        setStatus([
          "Stripe sandbox merch checkout opened.",
          `Order: ${result.orderId}`,
          "Physical merch only. No digital access, entitlement, payout, cash-out, withdrawal, transfer, or payable balance was created.",
        ].join("\n"));
      } else {
        const result = await launchCreatorSandboxDigitalPurchase({ config, userId: user.id });
        setStatus([
          "Google Play / RevenueCat sandbox purchase launched.",
          `Product: ${result.productId}`,
          result.intentId ? `Intent: ${result.intentId}` : "Intent: created",
          "Webhook processing creates access/ledger only through the proved provider path.",
        ].join("\n"));
      }
      await refreshConfigs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sandbox purchase flow could not be launched.";
      setStatus(message);
      Alert.alert("Launch stopped", message);
    } finally {
      setBusy(null);
    }
  }, [allowed, busy, refreshConfigs, user?.id]);

  if (isLoading || loadingAccess) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading creator setup...</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Sandbox setup access required</Text>
        <Text style={styles.body}>{accessSummary}</Text>
        <AppActionButton label="Back to Studio" onPress={() => router.push("/channel-studio" as Parameters<typeof router.push>[0])} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Creator setup / Internal sandbox</Text>
        <Text style={styles.title}>Monetization Setup</Text>
        <Text style={styles.body}>
          Configure approved sandbox product tiers for paid content, tickets, access passes, seat passes, event passes, tips, and physical merch. This cannot activate production money or payouts.
        </Text>
        <View style={styles.pillRow}>
          <AppStatusPill label="Sandbox only" tone="default" />
          <AppStatusPill label="Not payable" tone="warning" />
          <AppStatusPill label="Payouts off" tone="muted" />
        </View>
      </View>

      <AppSection
        title="Safety state"
        subtitle={accessSummary}
        statusLabel="Fail closed"
        statusTone="warning"
      >
        <View style={styles.ruleGrid}>
          {[
            ["Live money", CREATOR_MONETIZATION_SETUP_POLICY.liveMoneyEnabled ? "On" : "Off"],
            ["Payouts", CREATOR_MONETIZATION_SETUP_POLICY.payoutsEnabled ? "On" : "Off"],
            ["Cash-out", CREATOR_MONETIZATION_SETUP_POLICY.cashOutEnabled ? "On" : "Absent"],
            ["Withdraw", CREATOR_MONETIZATION_SETUP_POLICY.withdrawalEnabled ? "On" : "Absent"],
            ["Transfer", CREATOR_MONETIZATION_SETUP_POLICY.transferEnabled ? "On" : "Absent"],
            ["Stripe Android digital checkout", CREATOR_MONETIZATION_SETUP_POLICY.stripeAndroidDigitalCheckoutEnabled ? "On" : "Absent"],
            ["Arbitrary Android prices", CREATOR_MONETIZATION_SETUP_POLICY.arbitraryAndroidPricesAllowed ? "Allowed" : "Blocked"],
            ["Payment grants publish", CREATOR_MONETIZATION_SETUP_POLICY.liveKitPublishGrantedByPayment ? "Yes" : "No"],
          ].map(([label, value]) => (
            <View key={label} style={styles.ruleRow}>
              <Text style={styles.ruleLabel}>{label}</Text>
              <Text style={styles.ruleValue}>{value}</Text>
            </View>
          ))}
        </View>
      </AppSection>

      <AppSection
        title="Approved product tier"
        subtitle="Creators choose mapped sandbox products only. No arbitrary Android digital pricing."
        statusLabel="$0.99 tiers"
      >
        <View style={styles.tierGrid}>
          {APPROVED_CREATOR_SANDBOX_TIERS.map((tier) => {
            const selected = tier.key === selectedTier.key;
            return (
              <Pressable
                accessibilityRole="button"
                key={tier.key}
                onPress={() => setSelectedKey(tier.key)}
                style={[styles.tierCard, selected && styles.tierCardSelected]}
              >
                <View style={styles.tierHeader}>
                  <Text style={styles.tierTitle}>{tier.label}</Text>
                  <AppStatusPill label={tier.providerRail === "stripe_physical_goods" ? "Stripe sandbox" : "Google Play"} tone={tier.providerRail === "stripe_physical_goods" ? "premium" : "default"} />
                </View>
                <Text style={styles.tierProduct}>{tier.providerProductId}</Text>
                <Text style={styles.tierBody}>{tier.unlocks}</Text>
                <Text style={styles.tierSafety}>{tier.safety}</Text>
              </Pressable>
            );
          })}
        </View>
      </AppSection>

      <AppSection
        title="Bind source"
        subtitle={selectedSourceCopy.helper}
        statusLabel={selectedTier.priceLabel}
      >
        <Text style={styles.label}>Setup title</Text>
        <TextInput
          autoCapitalize="sentences"
          onChangeText={setDisplayName}
          placeholder={selectedTier.label}
          placeholderTextColor="#7F8794"
          style={styles.input}
          value={displayName}
        />
        <Text style={styles.label}>{selectedSourceCopy.label}</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSourceId}
          placeholder={selectedSourceCopy.placeholder}
          placeholderTextColor="#7F8794"
          style={styles.input}
          value={sourceId}
        />
        <Text style={styles.hint}>
          Saved config stays sandbox/not-payable. Purchases create provider events, intents, grants, and ledger/order rows only through the existing sandbox provider path.
        </Text>
        <View style={styles.actionRow}>
          <AppActionButton
            label={busy === "save" ? "Saving..." : "Save sandbox config"}
            loading={busy === "save"}
            onPress={handleSave}
            variant="primary"
          />
          {selectedConfig ? (
            <AppActionButton
              label={busy === "launch" ? "Launching..." : selectedConfig.productType === "merch_physical_good" ? "Open Stripe sandbox" : "Launch sandbox purchase"}
              loading={busy === "launch"}
              onPress={() => handleLaunch(selectedConfig)}
              variant="secondary"
            />
          ) : null}
        </View>
      </AppSection>

      <AppSection
        title="Saved creator configs"
        subtitle="Creator setup records Owner/Admin can inspect safely."
        statusLabel={`${configs.length} saved`}
        collapsible
      >
        {configs.length ? configs.map((config) => (
          <View key={config.id} style={styles.configCard}>
            <View style={styles.configHeader}>
              <Text style={styles.configTitle}>{config.displayName}</Text>
              <AppStatusPill label={config.status === "sandbox" ? "Sandbox" : config.status} />
            </View>
            <Text style={styles.configBody}>{config.providerProductId}</Text>
            <Text style={styles.configBody}>{config.sourceType} / {config.sourceId}</Text>
            <View style={styles.pillRow}>
              <AppStatusPill label="Not payable" tone="warning" />
              <AppStatusPill label={config.grantsLiveKitPublish ? "Publish risk" : "No publish"} tone={config.grantsLiveKitPublish ? "danger" : "muted"} />
              <AppStatusPill label={config.requiresHostApproval ? "Host approval" : "No host power"} tone="muted" />
            </View>
            <AppActionButton
              label={config.productType === "merch_physical_good" ? "Open Stripe sandbox" : "Launch sandbox purchase"}
              onPress={() => handleLaunch(config)}
              variant="ghost"
            />
          </View>
        )) : (
          <AppEmptyState
            title="No saved setup yet"
            body="Choose an approved sandbox tier, bind a real source UUID, and save it. No fake sales or payable rows are created."
          />
        )}
      </AppSection>

      <AppSection
        title="Payout readiness"
        subtitle="Read-only. Tester setup cannot request or simulate payout execution."
        statusLabel="Blocked"
        statusTone="warning"
      >
        <View style={styles.ruleGrid}>
          {[
            ["Stripe Connect", "Readiness only"],
            ["Payout execution", "Blocked"],
            ["Cash-out", "Absent"],
            ["Withdrawal", "Absent"],
            ["Transfer", "Absent"],
            ["Payable balance", "Not shown"],
          ].map(([label, value]) => (
            <View key={label} style={styles.ruleRow}>
              <Text style={styles.ruleLabel}>{label}</Text>
              <Text style={styles.ruleValue}>{value}</Text>
            </View>
          ))}
        </View>
      </AppSection>

      {ownerOperator ? (
        <AppSection
          title="Owner/Admin inspection"
          subtitle="Sanitized creator configs visible to owner/operator accounts."
          statusLabel={`${adminConfigs.length} configs`}
          collapsible
          defaultExpanded={false}
        >
          {adminConfigs.length ? adminConfigs.slice(0, 20).map((config) => (
            <View key={`admin-${config.id}`} style={styles.configCard}>
              <Text style={styles.configTitle}>{config.displayName}</Text>
              <Text style={styles.configBody}>Creator: {config.creatorId}</Text>
              <Text style={styles.configBody}>Product: {config.productKey}</Text>
              <Text style={styles.configBody}>Source: {config.sourceType} / {config.sourceId}</Text>
              <Text style={styles.configBody}>Production: off | Payout: off | Payable: no</Text>
            </View>
          )) : (
            <AppEmptyState
              title="No owner/admin configs yet"
              body="Creator sandbox config rows will appear here after saved setup. No secrets or raw provider payloads are shown."
            />
          )}
        </AppSection>
      ) : null}

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    gap: 10,
  },
  body: {
    color: "#D7DEEC",
    fontSize: 15,
    lineHeight: 22,
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#0B0F17",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 22,
  },
  configBody: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  configCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  configHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  configTitle: {
    color: "#F8FAFF",
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  container: {
    backgroundColor: "#0B0F17",
    gap: 18,
    minHeight: "100%",
    padding: 18,
    paddingBottom: 48,
  },
  header: {
    gap: 12,
    paddingTop: 12,
  },
  hint: {
    color: "#8E98AA",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    borderWidth: 1,
    color: "#F8FAFF",
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kicker: {
    color: "#9BD2FF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  label: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  pillRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ruleGrid: {
    gap: 8,
  },
  ruleLabel: {
    color: "#AAB4C8",
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  ruleRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ruleValue: {
    color: "#F8FAFF",
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
  },
  statusBox: {
    backgroundColor: "rgba(10,14,22,0.78)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  statusText: {
    color: "#D7DEEC",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  tierBody: {
    color: "#D7DEEC",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  tierCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.13)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    minHeight: 44,
    padding: 14,
  },
  tierCardSelected: {
    backgroundColor: "rgba(116,130,255,0.14)",
    borderColor: "rgba(155,210,255,0.45)",
  },
  tierGrid: {
    gap: 10,
  },
  tierHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  tierProduct: {
    color: "#9BD2FF",
    fontSize: 12,
    fontWeight: "900",
  },
  tierSafety: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  tierTitle: {
    color: "#F8FAFF",
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  title: {
    color: "#F8FAFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0,
  },
});
