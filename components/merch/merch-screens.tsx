import { ChillywoodBrandedSurface } from "../ui/chillywood-branded-surface";
import { AppBackButton } from "../navigation/app-back-button";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSession } from "../../_lib/session";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { MerchTrackingPanel } from "./merch-tracking-panel";
import { MerchShippingDetails } from "./merch-shipping-details";
import { MerchReturnQueue } from "./merch-return-queue";
import { MerchReturnCases } from "./merch-return-cases";
import { configureMerchVariants, createMerchCheckoutAttemptId, launchMerchCheckout, MerchCheckoutAbortedError, readMerchOrders, readMerchProducts, saveMerchProduct, updateMerchFulfillment, type MerchOrder, type MerchProduct, type MerchProductInput, type MerchVariantInput } from "../../_lib/creatorMerch";

import { approveMerchProductPhoto, assignMerchProductPhoto, discardMerchProductPhoto, pickMerchProductPhoto, readMerchProductPhotoStatus, resolveMerchProductPhotos, uploadMerchProductPhoto, type MerchProductPhotoFile, type MerchProductPhotoUploadAttempt } from "../../_lib/merchProductPhotos";

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
const errorText = (error: unknown) => error instanceof Error ? error.message : "We couldn't complete that request. Please try again.";
const NOTICE = "New physical-merch orders: creator 90% / app 10% of net after verified fees, taxes, refunds and adjustments. This is not an extra buyer surcharge. Final net remains unverified. Sandbox preview · US physical goods only. No live payments, creator earnings, or physical shipments. Merch never unlocks VIP or Premium.";
const productPhoto = (product: MerchProduct) => product.photoStatus === "blocked" ? null : product.photoAssetId ? product.photoUrl : product.imageUrl;
const variantLabel = (variant: { sku: string; size?: string | null; color?: string | null }) => [variant.size, variant.color].filter(Boolean).join(" / ") || variant.sku;
const shippingTerms = (mode: MerchProduct["shippingTrackingMode"]) => mode === "tracked" ? "Tracked shipping: 30-day return window starting at verified delivery." : mode === "untracked" ? "Untracked shipping: 30-day return window starting at verified successful purchase." : "The creator must choose tracked or untracked shipping before checkout.";
const knownReturnTerms = (order: MerchOrder) => order.returnWindowDays === 30 && ["physical_merch_verified_delivery_30d_v1", "physical_merch_declared_tracked_30d_v2", "physical_merch_declared_untracked_30d_v2"].includes(order.returnPolicyVersion ?? "");

function Button({ label, onPress, disabled = false, selected }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.button, selected && styles.selectedButton, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  return <ChillywoodBrandedSurface variant="app" testID="merch-branded-surface"><ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><AppBackButton testID="merch-back-button" accessibilityLabel={`Go back from ${title}`} style={{ alignSelf: "flex-start" }} onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")} /><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.notice}>{NOTICE}</Text>{children}</ScrollView></ChillywoodBrandedSurface>;
}

// Exact-session remount removes private order/editor state synchronously on account
// replacement; retired operations cannot write into a replacement screen.
function SessionGate({ children }: { children: React.ReactNode }) {
  const { authority, authorityStatus } = useSession();
  const router = useRouter();
  if (authorityStatus === "loading") return <Shell title="Shop"><ActivityIndicator accessibilityLabel="Checking account" /></Shell>;
  if (authorityStatus !== "active" || !authority || authority.restoreOnly) return <Shell title="Shop"><Text style={styles.body}>Sign in with an active account to browse this shop and view your orders.</Text>{!authority ? <Button label="Sign in" onPress={() => router.push("/(auth)/login")} /> : null}</Shell>;
  return <React.Fragment key={JSON.stringify(authority)}>{children}</React.Fragment>;
}

function usePage<T extends { id: string }>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>) {
  const [items, setItems] = useState<T[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), busy = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async (next?: string) => {
    if (!alive.current || busy.current) return;
    busy.current = true; const ticket = ++generation.current; setLoading(true); setError(null);
    if (!next) { setItems([]); setCursor(null); }
    try { const page = await read(next); if (!alive.current || ticket !== generation.current) return;
      setItems(previous => next ? Array.from(new Map([...previous, ...page.items].map(item => [item.id, item])).values()) : page.items); setCursor(page.nextCursor);
    } catch (e) { if (alive.current && ticket === generation.current) setError(errorText(e)); }
    finally { if (ticket === generation.current) { busy.current = false; if (alive.current) setLoading(false); } }
  }, [read]);
  useFocusEffect(useCallback(() => { alive.current = true; void load(); return () => { alive.current = false; generation.current++; busy.current = false; }; }, [load]));
  return { items, loading, error, cursor, refresh: () => load(), more: () => cursor ? load(cursor) : Promise.resolve() };
}
function PageStatus({ page, empty }: { page: { loading: boolean; error: string | null; items: unknown[]; cursor: string | null; refresh: () => void; more: () => void }; empty: string }) {
  return <>{page.loading ? <ActivityIndicator accessibilityLabel="Loading" /> : null}{page.error ? <View accessibilityLiveRegion="polite"><Text style={styles.error}>{page.error}</Text><Button label="Retry" onPress={page.refresh} /></View> : null}{!page.loading && !page.error && !page.items.length ? <Text style={styles.body}>{empty}</Text> : null}{page.cursor ? <Button label="Load more" disabled={page.loading} onPress={page.more} /> : null}</>;
}

export function MerchShopScreen({ creatorId }: { creatorId: string }) { return <SessionGate><Shop key={creatorId} creatorId={creatorId} /></SessionGate>; }
function Shop({ creatorId }: { creatorId: string }) {
  const router = useRouter(), { user } = useSession();
  const read = useCallback(async (cursor?: string) => { const result = await readMerchProducts({ creatorId, cursor }); return { items: result.products, nextCursor: result.nextCursor }; }, [creatorId]);
  const page = usePage(read);
  const [selected, setSelected] = useState<MerchProduct | null>(null), [quantity, setQuantity] = useState(1), [busy, setBusy] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const selectedVariant = selected?.variantMode === "options" ? selected.variants?.find(variant => variant.id === variantId && variant.status === "active") : null;
  const optionRequired = selected?.variantMode === "options";
  const availableQuantity = optionRequired ? selectedVariant?.availableQuantity ?? 0 : selected?.availableQuantity ?? 0;
  const latch = useRef(false), alive = useRef(true), attempt = useRef<string | null>(null), focusGeneration = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useFocusEffect(useCallback(() => { alive.current = true; const generation = ++focusGeneration.current; return () => { if (generation === focusGeneration.current) { focusGeneration.current++; alive.current = false; } }; }, []));
  useEffect(() => { setSelected(current => current ? page.items.find(product => product.id === current.id) ?? null : null); }, [page.items]);
  const buy = async () => {
    if (!alive.current || !selected || !selected.shippingTrackingMode || latch.current || page.loading || page.error || !selected.checkoutAvailable || quantity > availableQuantity || (optionRequired && !selectedVariant)) return;
    const generation = focusGeneration.current;
    latch.current = true; setBusy(true); setNotice(null); attempt.current ??= createMerchCheckoutAttemptId();
    try { const result = await launchMerchCheckout({ productId: selected.id, variantId: selectedVariant?.id ?? null, quantity, attemptId: attempt.current, trackingMode: selected.shippingTrackingMode, expectedUnitPriceMinor: selected.priceMinor, expectedCurrency: selected.currency, isPresentationCurrent: () => alive.current && generation === focusGeneration.current }); if (alive.current && generation === focusGeneration.current) { setNotice("Checkout opened. Returning or canceling does not confirm payment. Check your order status."); router.push({ pathname: "/merch/orders", params: { orderId: result.orderId } }); } }
    catch (e) {
      if (e instanceof MerchCheckoutAbortedError && e.attemptId === attempt.current) {
        attempt.current = null; // Explicit durable no-dispatch acknowledgement only; never auto-retry.
        if (alive.current && generation === focusGeneration.current) setNotice(errorText(e));
      } else if (alive.current && generation === focusGeneration.current) setNotice(`${errorText(e)} Check your orders before trying again; payment may still be pending.`);
    }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  return <Shell title={selected ? selected.title : "Shop"}>
    <View style={styles.row}><Button label="My orders" onPress={() => router.push("/merch/orders")} />{user?.id === creatorId ? <Button label="Manage shop" onPress={() => router.push("/merch/studio")} /> : null}</View>
    {user?.id === creatorId ? <Text style={styles.notice}>Buyer preview · Only published listings appear here.</Text> : null}
    {selected ? <View style={styles.card}>
      <Text style={styles.notice}>{shippingTerms(selected.shippingTrackingMode)} This declaration is frozen for your order. Unresolved returns, disputes or nondelivery claims keep affected creator earnings on hold. Sandbox fulfillment status is not verified delivery.</Text>
      <Button label="All products" disabled={busy} onPress={() => { setSelected(null); setNotice(null); }} />
      {productPhoto(selected) ? <Image source={{ uri: productPhoto(selected)! }} style={styles.image} accessibilityLabel={selected.title} /> : null}
      <Text style={styles.price}>{money(selected.priceMinor, selected.currency)}</Text><Text style={styles.body}>{selected.description || "No description provided."}</Text>
      {optionRequired ? <View style={styles.optionGroup}><Text style={styles.heading}>Choose size / color</Text><Text style={styles.notice}>Every option has the same price. Stock is separate for each option.</Text><View style={styles.row}>{(selected.variants ?? []).filter(variant => variant.status !== "archived").map(variant => <Button key={variant.id} label={`${variantLabel(variant)}${variant.status !== "active" ? " · Unavailable" : variant.availableQuantity < 1 ? " · Sold out" : ""}`} selected={selectedVariant?.id === variant.id} disabled={busy || variant.status !== "active" || variant.availableQuantity < 1} onPress={() => { setVariantId(variant.id); setQuantity(1); attempt.current = null; setNotice(null); }} />)}</View>{selectedVariant ? <Text style={styles.body}>Selected: {variantLabel(selectedVariant)} · SKU {selectedVariant.sku}</Text> : <Text style={styles.notice}>Select an available size / color before checkout.</Text>}</View> : null}
      <Text style={styles.body}>{optionRequired && !selectedVariant ? "Choose an option to see its stock." : availableQuantity > 0 ? `${availableQuantity} available` : "Sold out"}</Text><Text style={styles.notice}>{selected.shippingSummary}</Text>
      <View style={styles.row}><Button label="Decrease quantity" disabled={busy || quantity <= 1} onPress={() => { setQuantity(q => q - 1); attempt.current = null; }} /><Text style={styles.body}>Quantity: {quantity}</Text><Button label="Increase quantity" disabled={busy || quantity >= Math.min(10, availableQuantity)} onPress={() => { setQuantity(q => q + 1); attempt.current = null; }} /></View>
      {selected.checkoutAvailable && selected.shippingTrackingMode && availableQuantity > 0 && (!optionRequired || selectedVariant) ? <Button label={busy ? "Opening checkout…" : `Sandbox checkout · ${money(selected.priceMinor * quantity, selected.currency)}`} disabled={busy || quantity > availableQuantity} onPress={() => void buy()} /> : <Text style={styles.notice}>Checkout unavailable: {optionRequired && !selectedVariant ? "Select an available size / color." : selected.checkoutReason || "This product is not ready for checkout."}</Text>}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </View> : <>{page.items.map(product => <View key={product.id} style={styles.card}>{productPhoto(product) ? <Image source={{ uri: productPhoto(product)! }} style={styles.image} accessibilityLabel={product.title} /> : null}<Text style={styles.heading}>{product.title}</Text><Text style={styles.price}>{money(product.priceMinor, product.currency)}</Text><Text style={styles.body}>{product.variantMode === "options" ? "Sizes / colors available" : product.availableQuantity > 0 ? `${product.availableQuantity} available` : "Sold out"}</Text><Button label={`View ${product.title}`} onPress={() => { setSelected(product); setVariantId(null); setQuantity(1); attempt.current = null; }} /></View>)}<PageStatus page={page} empty="No products are published yet. Check back later." /></>}
  </Shell>;
}

function OrderCard({ order, manage, caseId, onChanged }: { caseId?: string; order: MerchOrder; manage: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null); const latch = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const focusGeneration = useRef(0);
  useFocusEffect(useCallback(() => { alive.current = true; focusGeneration.current++; return () => { alive.current = false; focusGeneration.current++; }; }, []));
  const resume = async () => {
    if (!alive.current || latch.current || !order.checkoutAttemptId || !order.checkoutResumeAvailable) return;
    latch.current = true; setBusy(true); setError(null); const generation = focusGeneration.current;
    try {
      await launchMerchCheckout({ productId: order.productId, variantId: order.variantId ?? null, quantity: order.quantity, attemptId: order.checkoutAttemptId, trackingMode: order.shippingTrackingMode, expectedUnitPriceMinor: order.unitPriceMinor ?? undefined, expectedCurrency: order.currency,
        isPresentationCurrent: () => alive.current && focusGeneration.current === generation });
      if (alive.current && focusGeneration.current === generation) setError("Checkout reopened for this same order. Refresh orders after returning; opening checkout does not confirm payment.");
    } catch (e) { if (alive.current && focusGeneration.current === generation) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const update = async (status: string) => { if (!alive.current || latch.current) return; latch.current = true; setBusy(true); setError(null);
    try { await updateMerchFulfillment({ orderId: order.id, status, expectedStatus: order.fulfillmentStatus }); if (alive.current) onChanged(); }
    catch (e) { if (alive.current) setError(errorText(e)); } finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const router = useRouter();
  const nextStatuses = ["not_started", "pending"].includes(order.fulfillmentStatus) ? ["processing"] : order.fulfillmentStatus === "processing" ? ["shipped", "blocked"] : order.fulfillmentStatus === "shipped" ? ["delivered"] : [];
  return <View style={styles.card}>
    <Text style={styles.heading}>{order.title}</Text>
    <Text selectable style={styles.body}>Order {order.id}</Text>
    <Text style={styles.body}>Quantity {order.quantity} · {money(order.totalMinor, order.currency)}</Text>
    {order.variantId ? <Text style={styles.body}>Option: {variantLabel({ sku: order.sku ?? "", size: order.size, color: order.color })} · SKU {order.sku}</Text> : null}
    <Text style={styles.body}>Payment: {order.paymentStatus} · Fulfillment: {order.fulfillmentStatus}</Text>
    <MerchShippingDetails orderId={order.id} paymentStatus={order.paymentStatus} refundedAmountMinor={order.refundedAmountMinor} fulfillmentStatus={order.fulfillmentStatus} />
    <MerchTrackingPanel orderId={order.id} trackingMode={order.shippingTrackingMode ?? null} manage={manage} paymentStatus={order.paymentStatus} onChanged={onChanged} />
    <MerchReturnCases caseId={caseId} orderId={order.id} manage={manage} paymentStatus={order.paymentStatus} deadline={order.returnWindowEndsAt} onChanged={onChanged} />
    <Text style={styles.body}>{new Date(order.createdAt).toLocaleString()}</Text>
    {order.refundedAmountMinor > 0 ? <Text style={styles.notice}>Refunded: {money(order.refundedAmountMinor, order.currency)}</Text> : null}
    <Text style={styles.notice}>{order.netSharePolicyVersion === "physical_merch_net_90_10_v1" && order.platformNetShareBps === 1000 && order.creatorNetShareBps === 9000 ? order.netSettlementStatus === "held_unqualified" ? "Recorded merch terms: creator 90% / app 10% of net. Observed amounts are provisional. Tax service fees still need verification; settlement remains held for fulfillment, returns and financial review. Not available for cash-out." : "Recorded merch terms: creator 90% / app 10% of net. Provider fees and final net are not yet verified." : "Historical order: no new revenue-share terms applied. Original settlement terms require verification."}</Text>
    <Text style={styles.notice}>{knownReturnTerms(order) ? `Recorded return terms: ${order.shippingTrackingMode === "untracked" ? "30 days from verified successful purchase" : "30 days from verified delivery"}. Unresolved returns, disputes or nondelivery claims keep affected creator earnings on hold.` : "Historical order: the new 30-day return terms have not been applied."}</Text>
    {knownReturnTerms(order) ? <Text style={styles.notice}>{order.shippingTrackingMode === "untracked" && !order.verifiedPurchaseAt ? "Return window has not started: verified successful purchase is required." : order.shippingTrackingMode !== "untracked" && !order.verifiedDeliveryAt ? "Return window has not started: verified delivery is required." : order.returnWindowStatus === "open" ? "The return window is open. Affected earnings remain held." : order.returnWindowStatus === "elapsed" ? "The return window has elapsed. This does not make earnings available for cash-out; other holds still apply." : "Return or dispute review is required. Affected earnings remain held."}</Text> : null}
    {manage ? <Text style={styles.notice}>{order.providerDisputeRefreshStatus === "fresh" && order.providerDisputeCheckedAt ? `Payment review checked ${new Date(order.providerDisputeCheckedAt).toLocaleString()}.` : "Payment review needs refreshed verification."} This is an observation, not confirmation that earnings are available. Other holds still apply.</Text> : null}
    <Text style={styles.notice}>Sandbox order — no physical shipment. Fulfillment updates record test status only; they do not dispatch or deliver goods.</Text>
    {!manage && order.paymentStatus === "pending" ? <>
      <Text style={styles.notice}>{order.checkoutResumeReason || "Payment is not confirmed. Refresh this order before trying another purchase."}</Text>
      {order.checkoutResumeAvailable && order.checkoutAttemptId ? <Button label="Resume same sandbox checkout" disabled={busy} onPress={() => void resume()} /> : null}
    </> : null}
    {(order.fulfillmentStatus === "blocked" || (order.paymentStatus === "pending" && !order.checkoutResumeAvailable)) ? <Button label="Get order help" onPress={() => router.push({ pathname: "/support", params: { orderId: order.id, orderRole: manage ? "creator" : "buyer" } })} /> : null}
    {manage && order.paymentStatus === "paid" && order.refundedAmountMinor === 0 ? nextStatuses.map(status => <Button key={status} label={`Record sandbox ${status}`} disabled={busy} onPress={() => void update(status)} />) : null}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}
function Orders({ manage = false, orderId, caseId }: { manage?: boolean; orderId?: string; caseId?: string }) {
  const read = useCallback(async (cursor?: string) => { const result = await readMerchOrders({ role: manage ? "creator" : "buyer", cursor, orderId }); return { items: result.orders, nextCursor: result.nextCursor }; }, [manage, orderId]);
  const page = usePage(read);
  return <><Button label="Refresh orders" disabled={page.loading} onPress={page.refresh} />{page.items.map(order => <OrderCard key={order.id} order={order} manage={manage} caseId={caseId} onChanged={page.refresh} />)}<PageStatus page={page} empty={orderId ? "This order is unavailable for your account." : "No orders yet."} /></>;
}
export function MerchOrdersScreen({ orderId, caseId }: { orderId?: string; caseId?: string }) {
  const router = useRouter();
  return <SessionGate><Shell title="My merch orders">{orderId ? <Button label="All my orders" onPress={() => router.replace("/merch/orders")} /> : null}<Orders orderId={orderId} caseId={caseId} /></Shell></SessionGate>;
}

type VariantDraft = MerchVariantInput & { available: string; committed: number };
function VariantsEditor({ product, onSaved, onCancel }: { product: MerchProduct; onSaved: (product: MerchProduct) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"simple" | "options">(product.variantMode ?? "simple");
  const [variants, setVariants] = useState<VariantDraft[]>(() => (product.variants ?? []).map(variant => ({ ...variant, available: String(variant.availableQuantity), committed: Math.max(0, variant.stockQuantity - variant.availableQuantity) })));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const latch = useRef(false), alive = useRef(true), generation = useRef(0);
  useEffect(() => () => { alive.current = false; }, []);
  useFocusEffect(useCallback(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []));
  const change = (id: string, patch: Partial<VariantDraft>) => setVariants(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
  const save = async () => {
    if (!alive.current || latch.current) return;
    if (mode === "options" && variants.length === 0) { setError("Add at least one size / color option. Options may all be paused or archived to stop new purchases."); return; }
    if (variants.some(variant => !variant.sku.trim() || (!variant.size?.trim() && !variant.color?.trim()) || !/^\d+$/.test(variant.available))) { setError("Each option needs a unique SKU, a size or color, and a whole-number available stock quantity."); return; }
    if (new Set(variants.map(variant => variant.sku.trim().toLowerCase())).size !== variants.length) { setError("Give every option a different SKU."); return; }
    latch.current = true; setBusy(true); setError(null); const ticket = generation.current;
    try {
      const saved = await configureMerchVariants({ productId: product.id, variantMode: mode, expectedUpdatedAt: product.updatedAt,
        variants: variants.map(variant => ({ id: variant.id, sku: variant.sku.trim(), size: variant.size?.trim() || null, color: variant.color?.trim() || null, stockQuantity: Number(variant.available) + variant.committed, status: variant.status })) });
      if (alive.current && ticket === generation.current) onSaved(saved);
    } catch (e) { if (alive.current && ticket === generation.current) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  return <View style={styles.card}>
    <Text style={styles.heading}>Sizes / colors and stock</Text>
    <Text style={styles.notice}>All options use the product price. SKU labels and the purchased option are saved with each order. Existing held or sold units cannot be removed.</Text>
    <View style={styles.row}><Button label="One simple product" selected={mode === "simple"} disabled={busy} onPress={() => setMode("simple")} /><Button label="Use sizes / colors" selected={mode === "options"} disabled={busy} onPress={() => setMode("options")} /></View>
    <Text style={styles.notice}>Switching between simple stock and options requires no held or sold stock. If orders already exist, keep their inventory mode or create a separate product.</Text>
    {mode === "options" ? <>
      {variants.map((variant, index) => <View key={variant.id} style={styles.optionGroup}>
        <Text style={styles.heading}>Option {index + 1} · {variant.status}</Text>
        {[{ label: "SKU", value: variant.sku, change: (value: string) => change(variant.id, { sku: value }) }, { label: "Size", value: variant.size ?? "", change: (value: string) => change(variant.id, { size: value }) }, { label: "Color", value: variant.color ?? "", change: (value: string) => change(variant.id, { color: value }) }, { label: "Available stock", value: variant.available, change: (value: string) => change(variant.id, { available: value }) }].map(field => <View key={field.label}><Text style={styles.body}>{field.label}</Text><TextInput accessibilityLabel={`Option ${index + 1} ${field.label}`} value={field.value} onChangeText={field.change} editable={!busy} maxLength={80} style={styles.input} autoCapitalize="none" /></View>)}
        <Text style={styles.notice}>{variant.committed} units already held or sold.</Text>
        {!(product.variants ?? []).some(saved => saved.id === variant.id) ? <Button label={`Remove unsaved option ${index + 1}`} disabled={busy} onPress={() => setVariants(items => items.filter(item => item.id !== variant.id))} /> : null}
        <View style={styles.row}><Button label={`Activate option ${index + 1}`} selected={variant.status === "active"} disabled={busy} onPress={() => change(variant.id, { status: "active" })} /><Button label={`Pause option ${index + 1}`} selected={variant.status === "paused"} disabled={busy} onPress={() => change(variant.id, { status: "paused" })} /><Button label={`Archive option ${index + 1}`} selected={variant.status === "archived"} disabled={busy} onPress={() => change(variant.id, { status: "archived" })} /></View>
      </View>)}
      <Button label="Add size / color option" disabled={busy || variants.length >= 50} onPress={() => setVariants(items => [...items, { id: createMerchCheckoutAttemptId(), sku: "", size: "", color: "", available: "0", committed: 0, stockQuantity: 0, status: "active" }])} />
    </> : <Text style={styles.body}>One stock quantity, with no option selection for buyers.</Text>}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Button label="Save sizes / colors" disabled={busy} onPress={() => void save()} /><Button label="Cancel option changes" disabled={busy} onPress={onCancel} />
  </View>;
}

function Editor({ product, done }: { product: MerchProduct | null; done: () => void }) {
  const { user, authority } = useSession();
  const [currentProduct, setCurrentProduct] = useState(product), [managingVariants, setManagingVariants] = useState(false);
  const [title, setTitle] = useState(product?.title ?? ""), [description, setDescription] = useState(product?.description ?? ""), [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [photoFile, setPhotoFile] = useState<MerchProductPhotoFile | null>(null), [stagedPhoto, setStagedPhoto] = useState<{ assetId: string; previewUrl: string; status: "pending_review" | "ready" | "blocked" } | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<{ assetId: string; uri: string } | null>(null);
  const photoAttempt = useRef<MerchProductPhotoUploadAttempt>({}), photoGeneration = useRef(0);
  const [advancedImage, setAdvancedImage] = useState(false);
  const committedQuantity = currentProduct?.variantMode === "options" ? (currentProduct.variants ?? []).reduce((total, variant) => total + Math.max(0, variant.stockQuantity - variant.availableQuantity), 0) : currentProduct ? Math.max(0, currentProduct.stockQuantity - currentProduct.availableQuantity) : 0;
  const [price, setPrice] = useState(product ? (product.priceMinor / 100).toFixed(2) : ""), [stock, setStock] = useState(String(product?.availableQuantity ?? 0));
  const [trackingMode, setTrackingMode] = useState<"tracked" | "untracked" | null>(product?.shippingTrackingMode ?? null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [productId] = useState(() => product?.id ?? createMerchCheckoutAttemptId()); const latch = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useFocusEffect(useCallback(() => { alive.current = true; return () => { alive.current = false; photoGeneration.current++; }; }, []));
  const authorityCurrent = () => !!authority && authority.state === "ACTIVE" && !authority.restoreOnly
    && authority.userId === user?.id && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  const choosePhoto = async (retry = false, source: "photos" | "files" = "photos") => {
    if (!alive.current || latch.current || !user || !authorityCurrent()) return;
    if (!retry && photoFile) return;
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    const current = () => { if (!alive.current || generation !== photoGeneration.current || !authorityCurrent()) throw new Error("Photo operation ended. Reopen the product to continue."); };
    try {
      const file = retry ? photoFile : await pickMerchProductPhoto(source); current();
      if (!file) return;
      if (!retry) { photoAttempt.current = {}; setStagedPhoto(null); }
      setPhotoFile(file);
      // A new product can choose locally before saving, but no bytes or asset
      // authority are allocated until the owned draft is acknowledged.
      if (!currentProduct) return;
      const staged = await uploadMerchProductPhoto({ ownerUserId: user.id, productId: currentProduct.id, file, attempt: photoAttempt.current, assertOperationCurrent: current });
      current(); setStagedPhoto(staged);
    } catch (e) { if (alive.current && generation === photoGeneration.current && authorityCurrent()) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const refreshPhoto = async () => {
    if (!alive.current || latch.current || !currentProduct || !user) return;
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    try {
      const status = await readMerchProductPhotoStatus({ ownerUserId: user.id, productId: currentProduct.id });
      if (!alive.current || generation !== photoGeneration.current) return;
      const [display] = await resolveMerchProductPhotos([status]);
      if (alive.current && generation === photoGeneration.current) setCurrentProduct(previous => previous ? { ...previous,
        photoAssetId: display.photoAssetId, photoStatus: display.photoStatus, photoStoragePath: display.photoStoragePath,
        photoUrl: display.photoUrl, photoCanApprove: display.photoCanApprove, photoScanStatus: display.photoScanStatus,
      } : previous);
    } catch (e) { if (alive.current && generation === photoGeneration.current) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const approvePhoto = async () => {
    if (!alive.current || latch.current || !currentProduct?.photoCanApprove || !currentProduct.photoAssetId || !user) return;
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    try {
      const saved = await approveMerchProductPhoto({ ownerUserId: user.id, productId: currentProduct.id, assetId: currentProduct.photoAssetId, expectedUpdatedAt: currentProduct.updatedAt });
      if (alive.current && generation === photoGeneration.current) setCurrentProduct(saved);
    } catch (e) { if (alive.current && generation === photoGeneration.current) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const cancelPhotoSelection = () => {
    if (!alive.current || latch.current || stagedPhoto || photoAttempt.current.upload?.payload) return;
    setPhotoFile(null); photoAttempt.current = {}; setError(null);
  };
  const discardPhoto = async () => {
    if (!alive.current || latch.current || !stagedPhoto || !user) return;
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    try {
      await discardMerchProductPhoto({ ownerUserId: user.id, assetId: stagedPhoto.assetId });
      if (alive.current && generation === photoGeneration.current) { setStagedPhoto(null); setPhotoFile(null); photoAttempt.current = {}; }
    } catch (e) { if (alive.current && generation === photoGeneration.current) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const assignPhoto = async (assetId: string | null) => {
    if (!alive.current || latch.current || !currentProduct || !user) return;
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    try {
      const saved = await assignMerchProductPhoto({ ownerUserId: user.id, productId: currentProduct.id, assetId, expectedUpdatedAt: currentProduct.updatedAt });
      if (alive.current && generation === photoGeneration.current) { setCurrentProduct(saved); setAttachedPreview(assetId && stagedPhoto?.assetId === assetId && saved.photoAssetId === assetId ? { assetId, uri: stagedPhoto.previewUrl } : null); setStagedPhoto(null); setPhotoFile(null); photoAttempt.current = {}; }
    } catch (e) { if (alive.current && generation === photoGeneration.current) setError(errorText(e)); }
    finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const save = async (publicationStatus: MerchProductInput["publicationStatus"]) => {
    if (!alive.current || latch.current || !authorityCurrent()) return;
    if (photoFile && (currentProduct || publicationStatus !== "draft")) { setError(currentProduct ? "Use or discard your selected photo before saving product changes." : "Save your draft to upload and review the selected photo before publishing."); return; }
    if (!title.trim() || !/^\d+(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || !/^\d+$/.test(stock)) { setError("Enter a title, a positive USD price with at most two decimal places, and a whole-number available stock quantity."); return; }
    if (!trackingMode) { setError("Choose tracked or untracked shipping so buyers can review the return-window terms."); return; }
    latch.current = true; setBusy(true); setError(null); const generation = photoGeneration.current;
    try {
      const saved = await saveMerchProduct({ id: productId, title: title.trim(), description, imageUrl: imageUrl.trim() || null, priceMinor: Math.round(Number(price) * 100), stockQuantity: currentProduct?.variantMode === "options" ? currentProduct.stockQuantity : Number(stock) + committedQuantity, publicationStatus, trackingMode, expectedUpdatedAt: currentProduct?.updatedAt });
      const current = () => { if (!alive.current || generation !== photoGeneration.current || !authorityCurrent()) throw new Error("Photo operation ended. Reopen the product to continue."); };
      current();
      if (!currentProduct && photoFile && user) {
        setCurrentProduct(saved);
        const staged = await uploadMerchProductPhoto({ ownerUserId: user.id, productId: saved.id, file: photoFile, attempt: photoAttempt.current, assertOperationCurrent: current });
        current(); setStagedPhoto(staged);
      } else done();
    }
    catch (e) { if (alive.current && generation === photoGeneration.current && authorityCurrent()) setError(errorText(e)); } finally { latch.current = false; if (alive.current) setBusy(false); }
  };
  const currentPhotoPreview = currentProduct?.photoStatus !== "blocked" && attachedPreview?.assetId === currentProduct?.photoAssetId ? attachedPreview?.uri : currentProduct?.photoUrl;
  if (managingVariants && currentProduct) return <VariantsEditor product={currentProduct} onSaved={saved => { setCurrentProduct(saved); setStock(String(saved.availableQuantity)); setManagingVariants(false); }} onCancel={() => setManagingVariants(false)} />;
  return <View style={styles.card}><Text style={styles.heading}>{product ? "Edit product" : "Add product"}</Text><Text style={styles.notice}>Publishing makes a sandbox listing visible on your Platform. It does not enable live checkout or shipping.</Text>{[
    { label: "Product title", value: title, change: setTitle }, { label: "Description", value: description, change: setDescription }, { label: "Price (USD)", value: price, change: setPrice }, ...(currentProduct?.variantMode === "options" ? [] : [{ label: "Available stock", value: stock, change: setStock }]),
  ].map(field => <View key={field.label}><Text style={styles.body}>{field.label}</Text><TextInput accessibilityLabel={field.label} value={field.value} onChangeText={field.change} editable={!busy} style={styles.input} autoCapitalize="none" maxLength={field.label === "Description" ? 2000 : 500} /></View>)}
    <Text style={styles.heading}>Shipping and return window</Text><View style={styles.row}><Button label="Tracked shipping" selected={trackingMode === "tracked"} disabled={busy} onPress={() => setTrackingMode("tracked")} /><Button label="Untracked shipping" selected={trackingMode === "untracked"} disabled={busy} onPress={() => setTrackingMode("untracked")} /></View><Text style={styles.notice}>{shippingTerms(trackingMode)} Changing this setting affects new orders only; existing orders keep their recorded terms.</Text>
    <Text style={styles.heading}>Product photo (optional)</Text>
    {!currentProduct ? <>
      {photoFile ? <Image source={{ uri: photoFile.uri }} style={styles.image} accessibilityLabel="Selected product photo preview" /> : null}
      <Text style={styles.notice}>{photoFile ? "Photo selected on this device. Save draft to upload it for safety checks, then choose Use this photo. Nothing is published automatically." : "Choose a photo now from Photos / Gallery or Files. It stays on your device until you save a draft."}</Text>
    </> : null}
    <Button label="Choose product photo from Photos / Gallery" disabled={busy || !!photoFile} onPress={() => void choosePhoto()} />
    <Button label="Choose product photo from Files" disabled={busy || !!photoFile} onPress={() => void choosePhoto(false, "files")} />
    {photoFile && !stagedPhoto && !photoAttempt.current.upload?.payload ? <Button label="Cancel photo selection" disabled={busy} onPress={cancelPhotoSelection} /> : null}
    {currentProduct ? <>
      {(stagedPhoto?.previewUrl || currentPhotoPreview) ? <Image source={{ uri: (stagedPhoto?.previewUrl || currentPhotoPreview)! }} style={styles.image} accessibilityLabel="Product photo preview" /> : null}
      <Text style={styles.notice}>{stagedPhoto ? `Selected photo: ${stagedPhoto.status}. Not attached yet.` : currentProduct.photoAssetId ? `Attached photo: ${currentProduct.photoStatus ?? "pending_review"}. Only approved photos appear for buyers.` : "Choose a photo from your device. It is checked before buyers can see it."}</Text>
      {currentProduct.photoAssetId ? <Button label="Refresh photo status" disabled={busy} onPress={() => void refreshPhoto()} /> : null}
      {currentProduct.photoScanStatus ? <Text style={styles.notice}>Safety scan: {currentProduct.photoScanStatus}</Text> : null}
      {currentProduct.photoCanApprove ? <><Text style={styles.notice}>The photo passed its scan and is awaiting your display approval. Approving does not publish this product or enable checkout.</Text><Button label="Approve photo for display" disabled={busy} onPress={() => void approvePhoto()} /></> : currentProduct.photoStatus === "pending_review" ? <Text style={styles.notice}>Photo checks are still pending. Approval is unavailable until the required scan is complete.</Text> : null}
      {photoFile ? <Text style={styles.notice}>Use, discard, or cancel this selection before choosing another photo. If registration is uncertain, retry the same upload first so its retained asset can be confirmed.</Text> : null}
      {currentProduct.photoStatus === "blocked" && !currentProduct.photoAssetId ? <Text style={styles.notice}>This photo was removed by safety checks. Choose a new photo for review; the previous image will not be shown.</Text> : null}
      {photoFile && !stagedPhoto ? <Button label="Retry photo upload" disabled={busy} onPress={() => void choosePhoto(true)} /> : null}
      {stagedPhoto ? <><Button label="Use this photo" disabled={busy || stagedPhoto.status === "blocked"} onPress={() => void assignPhoto(stagedPhoto.assetId)} /><Button label="Discard selected photo" disabled={busy} onPress={() => void discardPhoto()} /></> : null}
      {currentProduct.photoAssetId ? <Button label="Remove product photo" disabled={busy} onPress={() => void assignPhoto(null)} /> : null}
    </> : null}
    <Button label={advancedImage ? "Hide advanced image link" : "Advanced image link"} disabled={busy} onPress={() => setAdvancedImage(value => !value)} />
    {advancedImage ? <View><Text style={styles.notice}>Optional advanced fallback, used only when no uploaded photo is attached: use a permanent HTTPS image address you own, not a temporary signed link.</Text><TextInput accessibilityLabel="Image URL (HTTPS, optional)" value={imageUrl} onChangeText={setImageUrl} editable={!busy} style={styles.input} autoCapitalize="none" maxLength={2048} /></View> : null}
    <Text style={styles.notice}>{committedQuantity} units already held or sold. Available stock is the number you can still offer; saved totals also retain those committed units. If an order changes stock while you edit, refresh before saving again.</Text>
    {currentProduct ? <><Button label="Manage sizes / colors" disabled={busy} onPress={() => setManagingVariants(true)} /><Text style={styles.notice}>{currentProduct.variantMode === "options" ? "Options are enabled. Manage stock separately for each size / color." : "Optional: keep one simple product, or add sizes / colors after saving your product details."}</Text></> : <Text style={styles.notice}>Save a draft first to add optional sizes / colors.</Text>}
    {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    <Button label="Save draft" disabled={busy} onPress={() => void save("draft")} /><Button label="Publish listing" disabled={busy} onPress={() => void save("published")} />{product ? <><Button label="Pause listing" disabled={busy} onPress={() => void save("paused")} /><Button label="Archive listing" disabled={busy} onPress={() => void save("archived")} /></> : null}<Button label="Cancel editing" disabled={busy} onPress={done} />
  </View>;
}
export function MerchStudioScreen({ orderId, caseId }: { orderId?: string; caseId?: string } = {}) { return <SessionGate><Studio key={`${orderId ?? "all"}:${caseId ?? "all"}`} orderId={orderId} caseId={caseId} /></SessionGate>; }
function Studio({ orderId, caseId }: { orderId?: string; caseId?: string }) {
  const { user } = useSession(), router = useRouter();
  const [tab, setTab] = useState<"products" | "orders">(orderId ? "orders" : "products"), [editing, setEditing] = useState<MerchProduct | null | undefined>(undefined);
  const read = useCallback(async (cursor?: string) => { const result = await readMerchProducts({ owner: true, creatorId: user?.id, cursor }); return { items: result.products, nextCursor: result.nextCursor }; }, [user?.id]);
  const page = usePage(read);
  return <Shell title="Manage shop"><View style={styles.row}><Button label="Products" onPress={() => { setTab("products"); setEditing(undefined); }} /><Button label="Customer orders" onPress={() => { setTab("orders"); setEditing(undefined); }} /><Button label="Preview storefront" onPress={() => router.push({ pathname: "/merch/[creatorId]", params: { creatorId: user?.id ?? "" } })} /></View>
    <MerchReturnQueue role="creator" />
    {tab === "orders" ? <>{orderId ? <Button label="All customer orders" onPress={() => router.replace("/merch/studio")} /> : null}<Orders manage orderId={orderId} caseId={caseId} /></> : editing !== undefined ? <Editor key={editing?.id ?? "new"} product={editing} done={() => { setEditing(undefined); void page.refresh(); }} /> : <><Button label="Add product" onPress={() => setEditing(null)} />{page.items.map(product => <View key={product.id} style={styles.card}><Text style={styles.heading}>{product.title}</Text><Text style={styles.body}>{product.publicationStatus} · {money(product.priceMinor, product.currency)} · {product.availableQuantity} available of {product.stockQuantity}</Text><Button label={`Edit ${product.title}`} onPress={() => setEditing(product)} /></View>)}<PageStatus page={page} empty="Add your first product. Save a draft, then publish it to your Platform shop." /></>}
  </Shell>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 20, paddingTop: 54, paddingBottom: 48, gap: 16 },
  title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 28, fontWeight: "800" },
  heading: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 20, fontWeight: "700" },
  body: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 16, lineHeight: 24 },
  notice: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 14, lineHeight: 21 },
  error: { color: "#FFB8C1", fontSize: 16, lineHeight: 24 },
  price: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 22, fontWeight: "700" },
  card: { backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderColor: CHILLYWOOD_VISUAL.glassBorder, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  optionGroup: { borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderRadius: 12, padding: 12, gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, alignItems: "center", justifyContent: "center" },
  selectedButton: { backgroundColor: CHILLYWOOD_VISUAL.accentPurple, borderColor: CHILLYWOOD_VISUAL.primaryBorder, borderWidth: 2 },
  buttonText: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  input: { minHeight: 48, color: CHILLYWOOD_VISUAL.textPrimary, backgroundColor: CHILLYWOOD_VISUAL.controlBackground, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  image: { width: "100%", height: 220, borderRadius: 10, resizeMode: "contain" },
});
