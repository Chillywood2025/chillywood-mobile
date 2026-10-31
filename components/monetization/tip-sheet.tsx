import { openCreatorExternalCheckout } from "../../_lib/openCreatorExternalCheckout";
import { isIosExternalCheckoutSupported } from "../../_lib/iosExternalAdmission";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  AppState,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { trackEvent } from "../../_lib/analytics";
import { isGooglePlayExternalContentLinkSupported, withGooglePlayExternalContentLink } from "../../_lib/google-play-external-content-links";
import { createActionSingleFlightLatch } from "../../_lib/actionSingleFlight.mjs";
import { createBoundedVisibleReadGate } from "../../_lib/boundedVisibleReadGate";
import {
  listIosStoreProductsForConcept,
  type IosStoreProductKey,
} from "../../_lib/iosAppStoreCommerce";
import {
  isCreatorTipStorePriceSupported,
  createCreatorTipCheckout,
  readMyTipTransactionStatus,
  purchaseCreatorTipWithStore,
  type CreatorTipPublicStatus,
} from "../../_lib/creatorTips";
import { formatMonetizationCurrency } from "../../_lib/creatorMonetization";
import { parseCreatorTipAmount, formatCreatorTipAmountInput } from "../../_lib/creatorTipAmount";
import { readCreatorTipCustomAvailability, readCreatorTipCustomQuote, type CreatorTipCustomQuote } from "../../_lib/creatorTipCustomQuote";
import { readCreatorTipRouteCosts } from "../../_lib/readCreatorTipRouteCosts";
import { selectLowestCostCreatorTipAction, type CreatorTipPaymentSelection } from "../../_lib/creatorTipPaymentAction";
import { useSession } from "../../_lib/session";
import { readCreatorSupportedPrices, type CreatorSupportedPrice } from "../../_lib/creatorSupportedPrices";
import { MoneyScopeInfoButton } from "./MoneyScopeInfoButton";
import { CreatorMoneyHeader, MoneyScopeStrip, MoneyStatusChip, MoneySuccessReceipt } from "./money-ui";
import { CHILLYWOOD_VISUAL, ChillywoodPrimaryActionFill } from "../ui/chillywood-visual-system";

type TipSheetProps = {
  visible: boolean;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl?: string | null;
  sourceSurface: string;
  tipStatus: CreatorTipPublicStatus | null;
  sandboxTester?: boolean;
  onClose: () => void;
};

const STORE_NAME = Platform.OS === "ios" ? "App Store" : "Google Play";

type IosTipOption = {
  stableKey: IosStoreProductKey;
  productId: string;
  referencePriceMinor: number;
  priceLabel: string;
};

export function TipSheet({
  visible,
  creatorId,
  creatorName,
  creatorAvatarUrl,
  sourceSurface,
  tipStatus,
  sandboxTester = false,
  onClose,
}: TipSheetProps) {
  const router = useRouter();
  const { user, authority } = useSession();
  const contextKey = `${user?.id ?? ""}:${authority?.sessionGeneration ?? ""}:${creatorId}`;
  const contextRef = useRef(contextKey); contextRef.current = contextKey;
  const visibleRef = useRef(visible); visibleRef.current = visible;
  const presentationRef = useRef({ visible, key: contextKey, generation: 0 });
  if (presentationRef.current.visible !== visible || presentationRef.current.key !== contextKey) {
    presentationRef.current = { visible, key: contextKey, generation: presentationRef.current.generation + 1 };
  }
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const [selectedAmount, setSelectedAmount] = useState(300);
  const [customAmount, setCustomAmount] = useState<{ key: string; value: string } | null>(null);
  const customAmountText = customAmount?.key === contextKey ? customAmount.value : null;
  const [selectedIosTipKey, setSelectedIosTipKey] = useState<IosStoreProductKey>("tip_tier_1");
  const [busy, setBusy] = useState(false);
  const [noticeState, setNoticeState] = useState({ key: "", text: "" });
  const notice = noticeState.key === contextKey ? noticeState.text : "";
  const setNotice = (text: string) => setNoticeState({ key: contextKey, text });
  const [catalog, setCatalog] = useState<{ key: string; prices: CreatorSupportedPrice[]; loading: boolean; unavailable: boolean }>({ key: "", prices: [], loading: true, unavailable: false });
  const [catalogRetry, setCatalogRetry] = useState(0);
  const supportedPrices = useMemo(() => catalog.key === contextKey ? catalog.prices : [], [catalog, contextKey]);
  const catalogLoading = catalog.key !== contextKey || catalog.loading;
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const key = contextKey;
    setCatalog({ key, prices: [], loading: true, unavailable: false });
    void readCreatorSupportedPrices("creator_tip", creatorId).then(result => {
      if (!active || contextRef.current !== key) return;
      const prices = result.status === "resolved" && result.subjectUserId === user?.id
        ? result.prices.filter(price => isCreatorTipStorePriceSupported(price)
          && (Platform.OS === "ios" || (price.amountMinor >= (tipStatus?.minAmountCents ?? 100)
            && price.amountMinor <= (tipStatus?.maxAmountCents ?? 50000)))) : [];
      setCatalog({ key, prices, loading: false, unavailable: result.status !== "resolved" || prices.length === 0 });
      if (prices[0]) setSelectedAmount(prices[0].amountMinor);
    });
    return () => { active = false; };
  }, [catalogRetry, contextKey, creatorId, tipStatus?.minAmountCents, tipStatus?.maxAmountCents, user?.id, visible]);

  const openingResetGateRef = useRef(createBoundedVisibleReadGate());
  const checkoutLatchRef = useRef(createActionSingleFlightLatch());
  const pendingExternalTipRef = useRef<{ key: string; tipId: string } | null>(null);
  const externalReceiptReadRef = useRef(0);
  useEffect(() => {
    const receiptRead = externalReceiptReadRef;
    const listener = AppState.addEventListener("change", state => {
      const pending = pendingExternalTipRef.current;
      if (state !== "active" || !visible || !pending || pending.key !== contextKey) return;
      const readGeneration = ++receiptRead.current;
      void readMyTipTransactionStatus(pending.tipId).then(receipt => {
        if (contextRef.current !== pending.key || readGeneration !== receiptRead.current) return;
        setNoticeState({ key: pending.key, text: receipt.status === "paid"
          ? "Your tip is confirmed. No content or access is included."
          : "Your tip is not confirmed yet. Refresh Purchases & My Tickets before another attempt." });
      }).catch(() => {
        if (contextRef.current === pending.key && readGeneration === receiptRead.current) setNoticeState({ key: pending.key,
          text: "Tip status could not be confirmed. Refresh Purchases & My Tickets before another attempt." });
      });
    });
    return () => { listener.remove(); receiptRead.current++; };
  }, [contextKey, visible]);

  const iosTipCatalog = useMemo(() => {
    if (Platform.OS !== "ios") return [] as Omit<IosTipOption, "priceLabel">[];
    return listIosStoreProductsForConcept("creator_tip").map((entry) => ({
      stableKey: entry.stableKey,
      productId: entry.productId,
      referencePriceMinor: entry.referencePriceMinor,
    }));
  }, []);

  const iosTipOptions = useMemo(() => {
    return iosTipCatalog.filter(entry => supportedPrices.some(price => price.providerProductId === entry.productId && price.amountMinor === entry.referencePriceMinor)).map((entry) => ({
      stableKey: entry.stableKey,
      productId: entry.productId,
      referencePriceMinor: entry.referencePriceMinor,
      priceLabel: formatMonetizationCurrency(
        entry.referencePriceMinor,
        "usd",
      ),
    }));
  }, [iosTipCatalog, supportedPrices]);

  const selectedIosProduct = customAmountText !== null
    ? iosTipOptions.find(option => option.referencePriceMinor === parseCreatorTipAmount(customAmountText)) ?? null
    : iosTipOptions.find((option) => option.stableKey === selectedIosTipKey) ?? iosTipOptions[0] ?? null;
  useEffect(() => {
    if (Platform.OS !== "ios" || iosTipOptions.length === 0 || iosTipOptions.some(option => option.stableKey === selectedIosTipKey)) return;
    setSelectedIosTipKey(iosTipOptions[0].stableKey);
    setSelectedAmount(iosTipOptions[0].referencePriceMinor);
  }, [iosTipOptions, selectedIosTipKey]);

  const amounts = useMemo(() => {
    if (Platform.OS === "ios") {
      return iosTipOptions.map((entry) => entry.referencePriceMinor);
    }
    return Array.from(new Set(supportedPrices.map(price => price.amountMinor)));
  }, [iosTipOptions, supportedPrices]);

  useEffect(() => {
    if (!openingResetGateRef.current.shouldRun(visible)) return;
    setCustomAmount(null);
    const iosDefault = iosTipCatalog[0];
    if (Platform.OS === "ios" && iosDefault) {
      setSelectedIosTipKey(iosDefault.stableKey);
      setSelectedAmount(iosDefault.referencePriceMinor);
    }

    const defaultAmount = Platform.OS === "ios"
      ? iosTipCatalog[0]?.referencePriceMinor ?? 99
      : tipStatus?.defaultAmountCents && tipStatus.defaultAmountCents > 0
        ? tipStatus.defaultAmountCents
        : amounts[0] ?? 300;
    setSelectedAmount(defaultAmount);
    setNoticeState({ key: contextKey, text: "" });
    trackEvent("tip_sheet_opened", {
      creator_id: creatorId,
      route_name: "channel",
      source_surface: sourceSurface,
    });
  }, [amounts, contextKey, creatorId, iosTipCatalog, sourceSurface, tipStatus?.defaultAmountCents, visible]);

  const amountCents = customAmountText !== null ? parseCreatorTipAmount(customAmountText) ?? 0 : Platform.OS === "ios"
    ? (selectedIosProduct?.referencePriceMinor ?? selectedAmount)
    : selectedAmount;
  const [routeCostState, setRouteCostState] = useState({ key: "", amount: 0, message: "", expiresAt: "", comparable: false });
  const [routeCostRetry, setRouteCostRetry] = useState(0);
  useEffect(() => {
    if (!visible || amountCents <= 0 || catalogLoading) return;
    let active = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const key = contextKey;
    setRouteCostState({ key, amount: amountCents, message: "Checking exact-tip payment fees…", expiresAt: "", comparable: false });
    void readCreatorTipRouteCosts(creatorId, amountCents, supportedPrices.filter(price => price.amountMinor === amountCents)).then(result => {
      if (!active || contextRef.current !== key) return;
      setRouteCostState({ key, amount: amountCents, message: result.message, expiresAt: result.expiresAt ?? "", comparable: result.status === "compared" });
      if (result.expiresAt) expiry = setTimeout(() => {
        if (active && contextRef.current === key) setRouteCostState({ key, amount: amountCents,
          message: "Fee comparison expired. Refresh the comparison before choosing a route.", expiresAt: "", comparable: false });
      }, Math.max(0, Date.parse(result.expiresAt) - Date.now()));
    });
    return () => { active = false; if (expiry) clearTimeout(expiry); };
  }, [visible, contextKey, creatorId, amountCents, catalogLoading, supportedPrices, routeCostRetry]);
  const [customQuoteState, setCustomQuoteState] = useState<{ key: string; amount: number; quote: CreatorTipCustomQuote | null; message: string }>({ key: "", amount: 0, quote: null, message: "" });
  const customQuote = customQuoteState.key === contextKey && customQuoteState.amount === amountCents
    ? customQuoteState.quote : null;
  const customBoundsMessage = customQuoteState.key === contextKey && customQuoteState.amount === amountCents
    ? customQuoteState.message : "";
  const androidCustomCheckout = ((Platform.OS === "android" && isGooglePlayExternalContentLinkSupported())
    || (Platform.OS === "ios" && isIosExternalCheckoutSupported()))
    && Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= 2147483647;
  useEffect(() => {
    if (!visible || customAmountText === null || amountCents <= 0) return;
    let active = true;
    const key = contextKey;
    setCustomQuoteState({ key, amount: amountCents, quote: null, message: "" });
    void readCreatorTipCustomAvailability(creatorId, amountCents).then(result => {
      if (active && contextRef.current === key) setCustomQuoteState({ key, amount: amountCents, ...result });
    });
    return () => { active = false; };
  }, [amountCents, contextKey, creatorId, customAmountText, visible]);
  const minAmount = Platform.OS === "ios" ? amounts[0] ?? 99 : tipStatus?.minAmountCents ?? 100;
  const maxAmount = Platform.OS === "ios" ? amounts.at(-1) ?? 999 : tipStatus?.maxAmountCents ?? 50000;
  const amountValid = !catalogLoading && supportedPrices.some(price => price.amountMinor === amountCents) && (Platform.OS === "ios"
    ? selectedIosProduct != null
      && Number.isInteger(amountCents)
      && amountCents > 0
    : Number.isInteger(amountCents)
      && amountCents >= minAmount
      && amountCents <= maxAmount);
  const showSandboxCopy = sandboxTester || tipStatus?.testMode === true;
  // Tester mode changes copy only. Exact server-normalized creator authority
  // remains mandatory before any store purchase can be attempted.
  const canTipInSandbox = tipStatus?.canTip === true && tipStatus.creatorId === creatorId;

  const startCustomCheckout = async (selection?: CreatorTipPaymentSelection) => {
    if (!visibleRef.current || contextRef.current !== contextKey || !user?.id || (!customQuote && !androidCustomCheckout && !selection) || !canTipInSandbox || !checkoutLatchRef.current.tryAcquire()) return;
    const key = contextKey;
    const generation = presentationRef.current.generation;
    const current = () => mountedRef.current && visibleRef.current && contextRef.current === key
      && presentationRef.current.generation === generation && AppState.currentState !== "background" && AppState.currentState !== "inactive";
    setBusy(true); setNotice("");
    try {
      if (Platform.OS === "android") {
        await withGooglePlayExternalContentLink(async googlePlay => {
          if (!current()) throw new Error("Tip checkout was closed.");
          const result = await createCreatorTipCheckout({ creatorId, amountCents, currency: "usd", googlePlay,
            selectedActionId: selection?.actionId, capabilityId: selection?.purchaseBindingId,
            returnUrl: "chillywoodmobile://tip-status", cancelUrl: "chillywoodmobile://tip-status" });
          if (!current()) throw new Error("Tip checkout was closed.");
          if (!result.checkoutCreated || !result.url || !result.tipId) throw new Error("Tip checkout is not ready.");
          pendingExternalTipRef.current = { key, tipId: result.tipId };
          return { url: result.url };
        });
        if (current()) setNotice("Google Play opened test checkout. Return to check Purchases & My Tickets; opening checkout is not payment confirmation.");
        return;
      }
      // Explicit Stripe action, never an automatic substitute for a store SKU.
      const fresh = Platform.OS === "ios" ? null : await readCreatorTipCustomQuote(creatorId, amountCents, selection?.purchaseBindingId);
      if (!current()) return;
      if (Platform.OS !== "ios" && (!fresh || fresh.capabilityId !== (selection?.purchaseBindingId ?? customQuote?.capabilityId) || fresh.amountCents !== amountCents)) {
        setNotice("This exact amount's approved checkout route is no longer available. Nothing was charged."); return;
      }
      const result = await createCreatorTipCheckout({ creatorId, amountCents, currency: "usd", capabilityId: selection?.purchaseBindingId ?? fresh?.capabilityId, iosExternal: Platform.OS === "ios",
        selectedActionId: selection?.actionId,
        returnUrl: "chillywoodmobile://tip-status", cancelUrl: "chillywoodmobile://tip-status" });
      if (!current()) return;
      if (result.checkoutCreated && result.url && result.tipId) {
        pendingExternalTipRef.current = { key, tipId: result.tipId };
        // Approved iOS US links leave for the full system browser, not an
        // embedded Stripe SDK or an in-app Safari browser controller.
        await openCreatorExternalCheckout(result.url, current);
      }
      if (current()) setNotice(result.message || "Check Purchases & My Tickets for verified tip status. Opening checkout is not payment confirmation.");
    } catch {
      if (current()) setNotice("Tip checkout could not be confirmed. Refresh Purchases & My Tickets before another attempt.");
    } finally { checkoutLatchRef.current.release(); if (mountedRef.current) setBusy(false); }
  };

  const startCheckout = async (selectedActionId?: string) => {
    if (contextRef.current !== contextKey) return;
    if (!user?.id) {
      Alert.alert("Sign in to tip", "Sign in before sending a creator tip.");
      return;
    }

    if (!canTipInSandbox) {
      setNotice("Tips are unavailable for this creator right now.");
      return;
    }

    if (!amountValid) {
      setNotice("This exact amount has no verified payment route on this build. Nothing was charged. You can choose an available store amount instead.");
      return;
    }
    if (!checkoutLatchRef.current.tryAcquire()) return;
    const checkoutContext = contextKey;

    setBusy(true);
    setNotice("");
    trackEvent("tip_payment_started", {
      creator_id: creatorId,
      feature_key: "tips",
      offer_type: "tip",
      price_bucket: amountCents < 500 ? "under_5" : amountCents < 1000 ? "under_10" : "10_plus",
      route_name: "channel",
      source_surface: sourceSurface,
    });

    try {
      const result = await purchaseCreatorTipWithStore({
        selectedActionId,
        amountCents,
        creatorId,
        currency: tipStatus?.currency ?? "usd",
        iosStoreProductKey: Platform.OS === "ios" ? selectedIosProduct?.stableKey : undefined,
        sourceSurface,
        userId: String(user.id),
      });

      if (contextRef.current !== checkoutContext) return;

      if (!result.ok) {
        setNotice(result.message || "Tips are unavailable right now.");
        return;
      }

      setNotice(result.message || "Store checkout returned. Check Purchases & My Tickets for verified tip status. No access is included.");
    } catch {
      if (contextRef.current === checkoutContext) setNotice(`${STORE_NAME} tip could not be confirmed. Refresh Purchases & My Tickets before another attempt.`);
    } finally {
      checkoutLatchRef.current.release();
      setBusy(false);
    }
  };

  const startLowestCostCheckout = async () => {
    if (!visibleRef.current || !canTipInSandbox || contextRef.current !== contextKey
      || routeCostState.key !== contextKey || routeCostState.amount !== amountCents || !routeCostState.comparable
      || !(Date.parse(routeCostState.expiresAt) > Date.now()) || !checkoutLatchRef.current.tryAcquire()) return;
    const generation = presentationRef.current.generation;
    const current = () => mountedRef.current && visibleRef.current && contextRef.current === contextKey
      && presentationRef.current.generation === generation && AppState.currentState !== "background" && AppState.currentState !== "inactive";
    let selected: CreatorTipPaymentSelection | null = null;
    setBusy(true); setNotice("");
    try {
      selected = await selectLowestCostCreatorTipAction({ creatorId, amountCents });
    } catch {
      if (current()) setNotice("The lowest-cost route could not be confirmed. No fallback was started. Refresh Purchases & My Tickets before retrying.");
    } finally { checkoutLatchRef.current.release(); if (mountedRef.current) setBusy(false); }
    if (!selected || !current()) return;
    if (selected.provider === "stripe_connect") await startCustomCheckout(selected);
    else if ((selected.provider === "app_store" && Platform.OS === "ios") || (selected.provider === "google_play" && Platform.OS === "android")) {
      if (!supportedPrices.some(price => price.priceKey === selected.purchaseBindingId && price.amountMinor === amountCents)) {
        setNotice("The selected exact store price is unavailable. No different route was started."); return;
      }
      await startCheckout(selected.actionId);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? () => {} : onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          accessibilityViewIsModal
          testID="tip-sheet"
        >
          <View style={styles.handle} />
          <CreatorMoneyHeader
            kicker="Creator support"
            title={`Tip ${creatorName || "creator"}`}
            creatorName={creatorName || "Creator"}
            imageUrl={creatorAvatarUrl}
            body="Send a contribution directly from this creator's Platform. Tips are support only and never unlock paid access."
            tone="premium"
          />

          {showSandboxCopy ? <MoneyStatusChip label={`No real charge · ${customQuote ? "Test checkout" : STORE_NAME}`} tone="warning" /> : null}
          {catalogLoading ? <Text accessibilityLiveRegion="polite" style={styles.secondaryButtonText}>Checking supported tip amounts…</Text> : null}
          {!catalogLoading && (catalog.unavailable || supportedPrices.length === 0) ? <>
            <Text accessibilityRole="alert" style={styles.secondaryButtonText}>No supported tip amount could be confirmed for this creator and store.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh supported tip amounts" style={styles.secondaryButton} onPress={() => setCatalogRetry(value => value + 1)}><Text style={styles.secondaryButtonText}>Refresh amounts</Text></TouchableOpacity>
          </> : null}
          <Text style={styles.secondaryButtonText}>Amounts are in USD. Store checkout needs an exact price match. Custom amounts need a separately approved payment route.</Text>
          {routeCostState.key === contextKey && routeCostState.amount === amountCents ? <Text
            testID="tip-route-cost-status" accessibilityLiveRegion="polite" style={styles.secondaryButtonText}>{routeCostState.message}</Text> : null}
          {amountCents > 0 ? <TouchableOpacity testID="tip-route-cost-refresh" accessibilityRole="button"
            accessibilityLabel="Refresh payment fee comparison" disabled={busy || catalogLoading}
            style={styles.secondaryButton} onPress={() => setRouteCostRetry(value => value + 1)}>
            <Text style={styles.secondaryButtonText}>Refresh fees</Text>
          </TouchableOpacity> : null}
          {routeCostState.key === contextKey && routeCostState.amount === amountCents && routeCostState.comparable ? <TouchableOpacity
            testID="tip-lowest-cost-checkout" accessibilityRole="button" accessibilityLabel="Continue with the lowest verified fees for this exact tip"
            disabled={busy || !canTipInSandbox} style={styles.secondaryButton} onPress={startLowestCostCheckout}>
            <Text style={styles.secondaryButtonText}>Continue with lowest verified fees</Text>
          </TouchableOpacity> : null}

          <TextInput
            testID="tip-custom-amount"
            accessibilityLabel="Custom tip amount in USD"
            keyboardType="decimal-pad"
            editable={!busy && canTipInSandbox}
            value={customAmountText ?? formatCreatorTipAmountInput(amountCents)}
            onChangeText={value => { setCustomAmount({ key: contextKey, value }); setNotice(""); }}
            placeholder="Enter an amount, e.g. 2.50"
            style={styles.input}
          />
          {customAmountText !== null && !amountValid && !customQuote && !androidCustomCheckout ? (
            <Text testID="tip-custom-amount-unavailable" accessibilityRole="alert" style={styles.secondaryButtonText}>
              {parseCreatorTipAmount(customAmountText) === null
                ? "Enter a positive USD amount with no more than two decimal places."
                : customBoundsMessage || "This exact amount is not available through an approved payment route on this build. It will not be rounded, replaced with a store amount, or sent through another provider."}
            </Text>
          ) : null}
          {customAmountText !== null && (customQuote || androidCustomCheckout) ? (
            <View>
            {customQuote
              ? <Text style={styles.secondaryButtonText}>Verified Stripe limits: {formatMonetizationCurrency(customQuote.minAmountMinor, "usd")}–{formatMonetizationCurrency(customQuote.maxAmountMinor, "usd")} USD. Your tip: {formatMonetizationCurrency(amountCents, "usd")} USD.</Text>
              : <Text style={styles.secondaryButtonText}>Your tip: {formatMonetizationCurrency(amountCents, "usd")} USD. Your app store and the server must verify eligibility and payment limits before checkout opens. Your amount will not be changed.</Text>}
            <TouchableOpacity testID="tip-custom-stripe-checkout" accessibilityRole="button"
              accessibilityLabel={`Continue with Stripe test checkout for ${formatMonetizationCurrency(amountCents, "usd")}`}
              disabled={busy || !canTipInSandbox} accessibilityState={{ disabled: busy || !canTipInSandbox, busy }}
              style={styles.secondaryButton} onPress={() => { void startCustomCheckout(); }}>
              <Text style={styles.secondaryButtonText}>Continue with Stripe test checkout · {formatMonetizationCurrency(amountCents, "usd")}</Text>
            </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.amountGrid}>
            {Platform.OS === "ios" ? (
              iosTipOptions.map((option) => {
                const isSelected = option.referencePriceMinor === amountCents;
                return (
                  <TouchableOpacity
                    key={option.stableKey}
                    testID="tip-amount-option"
                    activeOpacity={0.86}
                    style={[styles.amountButton, isSelected && styles.amountButtonActive]}
                    accessibilityRole="button"
                    disabled={busy || !canTipInSandbox}
                    accessibilityState={{ selected: isSelected, disabled: busy || !canTipInSandbox }}
                    accessibilityLabel={`Choose ${option.priceLabel} App Store tip amount`}
                    onPress={() => {
                      setCustomAmount(null);
                      setSelectedAmount(option.referencePriceMinor);
                      setSelectedIosTipKey(option.stableKey);
                    }}
                  >
                    <Text style={[styles.amountText, isSelected && styles.amountTextActive]}>
                      {option.priceLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              amounts.map((amount) => (
                <TouchableOpacity
                  key={amount}
                  testID="tip-amount-option"
                  activeOpacity={0.86}
                  style={[styles.amountButton, amountCents === amount && styles.amountButtonActive]}
                  accessibilityRole="button"
                  disabled={busy || !canTipInSandbox}
                  accessibilityState={{ selected: amountCents === amount, disabled: busy || !canTipInSandbox }}
                  accessibilityLabel={`Choose ${formatMonetizationCurrency(amount, tipStatus?.currency ?? "usd")} tip amount`}
                  onPress={() => {
                    setCustomAmount(null);
                    setSelectedAmount(amount);
                  }}
                >
                  <Text style={[styles.amountText, amountCents === amount && styles.amountTextActive]}>
                    {formatMonetizationCurrency(amount, tipStatus?.currency ?? "usd")}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <MoneyScopeStrip
            includes="A private creator-support contribution."
            excludes="Tips do not unlock videos, events, rooms, VIP, subscriptions, badges, public rewards, or merchandise."
            excludesTestID="tip-no-content-unlock-copy"
          />
          <MoneyScopeInfoButton scope="creator_tip" label="What does a tip do?" />

          {notice ? <MoneySuccessReceipt title="Tip status" body={notice} testID="tip-success-receipt" /> : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={busy || !amountValid || !canTipInSandbox}
            style={[styles.primaryButton, (busy || !amountValid || !canTipInSandbox) && styles.primaryButtonDisabled]}
            onPress={() => { void startCheckout(); }}
            testID="tip-confirm-button"
            accessibilityRole="button"
            accessibilityLabel={`Tip ${creatorName || "creator"} ${formatMonetizationCurrency(amountCents, tipStatus?.currency ?? "usd")}. This supports the creator and does not unlock access.`}
            accessibilityState={{ disabled: busy || !amountValid || !canTipInSandbox, busy }}
          >
            <ChillywoodPrimaryActionFill radius={14} />
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.primaryButtonText}>{`Opening ${STORE_NAME}`}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>{`Continue with ${STORE_NAME}`}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity disabled={busy} style={styles.secondaryButton} accessibilityRole="button" accessibilityLabel="Open Purchases and My Tickets" onPress={() => { onClose(); router.push("/purchases"); }}>
            <Text style={styles.secondaryButtonText}>Purchases &amp; My Tickets</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            style={styles.secondaryButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close tip sheet"
            testID="tip-sheet-not-now-button"
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,4,10,0.62)",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: CHILLYWOOD_VISUAL.glassBackground,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.glassBorder,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 30,
    gap: 14,
  },
  handle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 4,
  },
  creatorRow: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#F8FAFF",
    fontSize: 22,
    fontWeight: "900",
  },
  creatorCopy: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    color: "#81D4FA",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    color: "#F8FAFF",
    fontSize: 23,
    fontWeight: "900",
  },
  body: {
    color: "#B8C4D8",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  testMode: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#FFE9B7",
    backgroundColor: "rgba(245,190,77,0.16)",
    fontSize: 12,
    fontWeight: "900",
  },
  amountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  amountButton: {
    minWidth: 82,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
  },
  amountButtonActive: {
    borderColor: "#7ED7FF",
    backgroundColor: "rgba(126,215,255,0.18)",
  },
  amountText: {
    color: "#DCE7F7",
    fontSize: 15,
    fontWeight: "900",
  },
  amountTextActive: {
    color: "#F8FAFF",
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.controlBorder,
    backgroundColor: CHILLYWOOD_VISUAL.controlBackground,
    color: "#F8FAFF",
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: "800",
  },
  noteInput: {
    minHeight: 74,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  policyCopy: {
    color: "#9CA8BA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  notice: {
    color: "#FFCFD6",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  primaryButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: CHILLYWOOD_VISUAL.accentPurple,
    borderWidth: 1,
    borderColor: CHILLYWOOD_VISUAL.primaryBorder,
    overflow: "hidden",
  },
  primaryButtonDisabled: {
    opacity: 0.48,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#C8D3E4",
    fontSize: 14,
    fontWeight: "900",
  },
});
