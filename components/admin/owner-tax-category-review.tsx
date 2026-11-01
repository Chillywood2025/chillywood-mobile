import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import {
  readOwnerTaxCatalog, readOwnerTaxReviewQueue, resolveOwnerTaxRequest, reviewOwnerTaxCategory, revokeOwnerTaxCategory,
  type CategoryReviewInput, type EvidenceStatus, type OwnerTaxCategory, type OwnerTaxRequest, type OwnerTaxReviewQueue,
  type TaxCatalogPage, type TaxReviewCursor, type TaxReviewIntent,
} from "../../_lib/ownerMerchTaxReview";
import { CHILLYWOOD_VISUAL as visual } from "../ui/chillywood-visual-system";

const sessionSnapshot = () => {
  const session = getCurrentAccountSessionAuthoritySnapshot();
  return session?.state === "ACTIVE" && !session.restoreOnly ? JSON.stringify(session) : "";
};
const body = { color: visual.textMuted };
const heading = { color: visual.textPrimary, fontWeight: "600" as const };
const card = { gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: visual.glassBorder, backgroundColor: visual.glassBackground };
const inputStyle = { color: visual.textPrimary, borderColor: visual.controlBorder, borderWidth: 1, borderRadius: 10, minHeight: 44, padding: 10 };
const evidenceLabel: Record<EvidenceStatus, string> = { current: "Current evidence on file", missing: "Evidence needed", expired: "Evidence needs renewal", unknown: "Not verified by this review" };
type Draft = Omit<CategoryReviewInput, "expiresAt"> & { date: string };
type Editor = { original: OwnerTaxCategory | null; draft: Draft };
type RequestReview = { request: OwnerTaxRequest; categoryId: string; note: string };
function Action({ label, onPress, disabled = false, selected = false, testID }: { label: string; onPress: () => void; disabled?: boolean; selected?: boolean; testID?: string }) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }}
    disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: selected ? visual.primaryBorder : visual.controlBorder, opacity: disabled ? 0.55 : 1 }}>
    <Text style={heading}>{label}</Text>
  </Pressable>;
}
function Field({ label, value, onChange, maxLength, multiline = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; multiline?: boolean; disabled?: boolean }) {
  return <View style={{ gap: 4 }}><Text style={body}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
    style={inputStyle} maxLength={maxLength} multiline={multiline} editable={!disabled} autoCapitalize="sentences" /></View>;
}
const blankDraft = (): Draft => ({ categoryKey: "", label: "", scopeDescription: "", taxCode: "", professionalBasisReference: "", coverageEvidenceReference: "", date: "", expectedRevision: 0 });
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 80);
const expiry = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getTime() > Date.now() ? parsed.toISOString() : "";
};

/** Category decisions are human review only. Never activate money or write provider evidence. */
export function OwnerTaxCategoryReviewPanel({ isOwner, ownerSessionKey }: { isOwner: boolean; ownerSessionKey: string }) {
  // The epoch observes every authority transition, even a batched A → B → A.
  const epoch = useRef(0), observed = useRef(sessionSnapshot());
  const subscribe = useCallback((notify: () => void) => subscribeToAccountSessionAuthority(() => {
    const next = sessionSnapshot();
    if (next !== observed.current) { observed.current = next; epoch.current++; }
    notify();
  }), []);
  const getSnapshot = useCallback(() => `${epoch.current}:${sessionSnapshot()}`, []);
  const authorityScope = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const focused = useIsFocused(), sessionKey = sessionSnapshot();
  const scope = isOwner && focused && !!sessionKey && ownerSessionKey === sessionKey ? authorityScope : "";
  const liveScope = useRef(scope), readVersion = useRef(0), catalogVersion = useRef(0), draftVersion = useRef(0);
  const readLock = useRef<object | null>(null), writeLock = useRef<object | null>(null), catalogLock = useRef<object | null>(null);
  if (liveScope.current !== scope) {
    liveScope.current = scope; readVersion.current++; catalogVersion.current++;
    readLock.current = null; writeLock.current = null; catalogLock.current = null;
  }
  const [state, setState] = useState<{ scope: string; queue: OwnerTaxReviewQueue | null; busy: boolean; error: string; notice: string }>({ scope: "", queue: null, busy: false, error: "", notice: "" });
  const [editor, setEditor] = useState<Editor | null>(null), [review, setReview] = useState<RequestReview | null>(null);
  const [revoke, setRevoke] = useState<OwnerTaxCategory | null>(null), [writing, setWriting] = useState(false);
  const [catalog, setCatalog] = useState<TaxCatalogPage | null>(null), [catalogBusy, setCatalogBusy] = useState(false), [catalogError, setCatalogError] = useState("");
  const [query, setQuery] = useState(""), [checked, setChecked] = useState(false), [confirm, setConfirm] = useState(false);
  const active = useCallback(() => !!scope && liveScope.current === scope && getSnapshot() === scope, [getSnapshot, scope]);
  const clearDrafts = useCallback(() => {
    catalogVersion.current++; draftVersion.current++; catalogLock.current = null;
    setEditor(null); setReview(null); setRevoke(null); setCatalog(null); setCatalogBusy(false); setCatalogError(""); setQuery(""); setChecked(false); setConfirm(false);
  }, []);
  const retire = useCallback(() => {
    readVersion.current++; catalogVersion.current++;
    readLock.current = null; writeLock.current = null; catalogLock.current = null;
  }, []);
  const load = useCallback(async (cursor: TaxReviewCursor | null = null, notice = "") => {
    if (!active() || readLock.current || writeLock.current) return;
    const lock = {}, version = ++readVersion.current;
    readLock.current = lock; clearDrafts();
    const current = () => active() && readVersion.current === version;
    setState({ scope, queue: null, busy: true, error: "", notice });
    try {
      const queue = await readOwnerTaxReviewQueue(current, cursor);
      if (current()) setState({ scope, queue, busy: false, error: "", notice });
    } catch {
      if (current()) setState({ scope, queue: null, busy: false, error: "The review queue is unavailable. Retry to check the latest categories and requests.", notice });
    } finally { if (readLock.current === lock) readLock.current = null; }
  }, [active, clearDrafts, scope]);
  useEffect(() => {
    setWriting(false); clearDrafts();
    if (scope) void load();
    return retire;
  }, [clearDrafts, load, retire, scope]);
  const current = state.scope === scope && !!scope ? state : null;
  const renderedVersion = readVersion.current;
  const renderedDraftVersion = draftVersion.current;
  const currentView = () => active() && renderedVersion === readVersion.current && !!current?.queue && !readLock.current && !writeLock.current;
  const loadCatalog = async (nextCursor: string | null = null) => {
    if (!currentView() || catalogLock.current) return;
    const lock = {}, version = ++catalogVersion.current;
    catalogLock.current = lock;
    const valid = () => active() && renderedVersion === readVersion.current && catalogVersion.current === version;
    setCatalogBusy(true); setCatalogError(""); setChecked(false); setConfirm(false);
    draftVersion.current++;
    if (!nextCursor) setCatalog(null);
    try {
      const page = await readOwnerTaxCatalog(valid, nextCursor);
      if (valid()) setCatalog(previous => ({ ...page, codes: nextCursor ? [...(previous?.codes ?? []), ...page.codes.filter(code => !previous?.codes.some(old => old.id === code.id))] : page.codes }));
    } catch (error) {
      if (valid()) setCatalogError(error instanceof Error ? error.message : "Provider category choices are unavailable. Retry.");
    } finally { if (catalogLock.current === lock) { catalogLock.current = null; if (valid()) setCatalogBusy(false); } }
  };
  const openEditor = (category: OwnerTaxCategory | null) => {
    if (!currentView()) return;
    clearDrafts();
    setEditor({ original: category, draft: category ? { categoryKey: category.categoryKey, label: category.label, scopeDescription: category.scopeDescription,
      taxCode: category.taxCode, professionalBasisReference: category.professionalBasisReference, coverageEvidenceReference: category.coverageEvidenceReference,
      date: category.expiresAt.slice(0, 10), expectedRevision: category.revision } : blankDraft() });
    void loadCatalog();
  };
  const changeDraft = (key: keyof Draft, value: string) => {
    if (!currentView()) return;
    draftVersion.current++;
    setEditor(previous => previous ? { ...previous, draft: { ...previous.draft, [key]: value, ...(key === "label" && !previous.original ? { categoryKey: slug(value) } : {}) } } : null);
    setChecked(false); setConfirm(false);
  };
  const runWrite = async (work: (valid: TaxReviewIntent) => Promise<unknown>, notice: string) => {
    if (!currentView() || renderedDraftVersion !== draftVersion.current || catalogLock.current) return;
    const lock = {}; writeLock.current = lock; setWriting(true);
    const valid = () => active() && renderedVersion === readVersion.current && renderedDraftVersion === draftVersion.current && writeLock.current === lock;
    try {
      await work(valid);
      if (!valid()) return;
      writeLock.current = null; setWriting(false);
      await load(null, notice);
    } catch (error) {
      if (valid()) {
        clearDrafts(); readVersion.current++;
        setState({ scope, queue: null, busy: false, notice: "", error: error instanceof Error ? error.message : "The save could not be confirmed. Refresh before trying again." });
      }
    } finally { if (writeLock.current === lock) { writeLock.current = null; if (active()) setWriting(false); } }
  };
  if (!scope) return null;
  const busy = writing || current?.busy === true;
  const latest = current?.queue?.categories.filter(category => !current.queue?.categories.some(other => other.categoryKey === category.categoryKey && other.revision > category.revision)) ?? [];
  const available = latest.filter(category => category.current && !category.revokedAt && Date.parse(category.expiresAt) > Date.now());
  const selectedCode = catalog?.codes.find(code => code.id === editor?.draft.taxCode);
  const validDraft = !!editor && selectedCode?.supported === true && !catalogBusy && !catalogError && editor.draft.categoryKey.length >= 2 && !!editor.draft.label.trim()
    && editor.draft.scopeDescription.trim().length >= 10 && editor.draft.professionalBasisReference.trim().length >= 3
    && editor.draft.coverageEvidenceReference.trim().length >= 3 && !!expiry(editor.draft.date);
  const codes = catalog?.codes.filter(code => `${code.name} ${code.description} ${code.id}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <View testID="owner-tax-category-review" style={card}>
    <Text accessibilityRole="header" style={heading}>Product category review · Owner only</Text>
    <Text style={body}>Review a category once, then reuse it for matching items. Creators choose a reviewed category; items that do not fit come here for review.</Text>
    <Text style={body}>Category review does not register a business, establish an exemption, verify provider setup or enable sales. Payment and payout switches are not changed.</Text>
    {current?.busy || !current ? <Text accessibilityLiveRegion="polite" style={body}>Loading category reviews…</Text> : null}
    {current?.error ? <Text accessibilityLiveRegion="polite" style={body}>{current.error}</Text> : null}
    {current?.notice ? <Text accessibilityLiveRegion="polite" style={body}>{current.notice}</Text> : null}
    <Action label={current?.error ? "Retry category reviews" : "Refresh category reviews"} disabled={busy} onPress={() => void load()} />
    {current?.queue && !editor && !review && !revoke ? <>
      <Text accessibilityRole="header" style={heading}>Creator requests</Text>
      {!current.queue.requests.length ? <Text style={body}>No category requests on this page. This is not evidence that tax obligations are satisfied.</Text> : null}
      {current.queue.requests.map(request => <View key={request.id} style={{ gap: 6, paddingVertical: 8 }}>
        <Text style={heading}>{request.title}</Text>
        {request.description ? <Text style={body}>{request.description}</Text> : null}
        {request.variants.map(variant => <Text key={variant.id} style={body}>Option: {variant.sku}{variant.size ? ` · Size ${variant.size}` : ""}{variant.color ? ` · ${variant.color}` : ""}</Text>)}
        <Text style={body}>{request.note || "No extra description supplied."}</Text>
        <Text style={body}>{request.status === "reviewed" ? "Category suggested · creator must select it" : request.status === "review_required" ? "Needs category review" : request.status === "ready" ? "Category and evidence recorded · sales controls remain separate" : "Category selected · independent evidence still needed"}</Text>
        {!request.current ? <Text style={body}>Listing changed or request replaced; the creator must submit a current request. This is review history only.</Text> : null}
        <Text style={body}>Human category review: {evidenceLabel[request.classificationStatus]}</Text>
        <Text style={body}>Provider setup: {evidenceLabel[request.providerStatus]}</Text>
        <Text style={body}>Creator / payment account: {evidenceLabel[request.accountStatus]}</Text>
        <Text style={body}>Tax responsibility / location coverage: {evidenceLabel[request.jurisdictionStatus]}</Text>
        <Text style={body}>Evidence status is a separate server observation, not a category approval or legal determination.</Text>
        {request.status === "review_required" && request.current ? <Action label={`Review category for ${request.title}`} disabled={busy} onPress={() => {
          if (!currentView()) return; clearDrafts(); setReview({ request, categoryId: "", note: "" });
        }} /> : null}
      </View>)}
      {current.queue.nextCursor ? <Action label="Next page of creator requests" disabled={busy} onPress={() => void load(current.queue?.nextCursor ?? null)} /> : null}
      <Text accessibilityRole="header" style={heading}>Reusable reviewed categories</Text>
      {!latest.length ? <Text style={body}>No reviewed categories yet. Nothing is pre-approved. Add a category only after reviewing its scope and supporting references.</Text> : null}
      <Action label="Add reviewed category" disabled={busy} onPress={() => openEditor(null)} />
      {latest.map(category => <View key={category.id} style={{ gap: 6, paddingVertical: 8 }}>
        <Text style={heading}>{category.label} · Revision {category.revision}</Text>
        <Text style={body}>{category.current && !category.revokedAt && Date.parse(category.expiresAt) > Date.now() ? "Current human review" : category.revokedAt ? "Revoked" : "Review needs renewal"} · Review expires {category.expiresAt.slice(0, 10)}</Text>
        <Text style={body}>{category.scopeDescription}</Text>
        <Text style={body}>Provider code: {category.taxCode} · Tax included in listed price</Text>
        <Text style={body}>Classification reference / reason: {category.professionalBasisReference}</Text>
        <Text style={body}>Coverage reference / reason: {category.coverageEvidenceReference}</Text>
        <Action label={`Review new revision of ${category.label}`} disabled={busy} onPress={() => openEditor(category)} />
        {category.current ? <Action label={`Revoke ${category.label}`} disabled={busy} onPress={() => { if (!currentView()) return; clearDrafts(); setRevoke(category); }} /> : null}
      </View>)}
    </> : null}
    {editor && current?.queue ? <View style={{ gap: 10 }} testID="owner-tax-category-editor">
      <Text accessibilityRole="header" style={heading}>{editor.original ? `Review revision ${editor.draft.expectedRevision + 1}` : "New reusable category"}</Text>
      <Field label="Category name" value={editor.draft.label} maxLength={160} disabled={busy} onChange={value => changeDraft("label", value)} />
      <Field label="Items included and excluded" value={editor.draft.scopeDescription} maxLength={4000} multiline disabled={busy} onChange={value => changeDraft("scopeDescription", value)} />
      <Text style={body}>Use a precise scope, not a blanket approval for every product. A category name is not a tax determination.</Text>
      <Field label="Find a provider category" value={query} maxLength={200} disabled={busy} onChange={setQuery} />
      {catalogBusy ? <Text accessibilityLiveRegion="polite" style={body}>Loading verified provider choices…</Text> : null}
      {catalogError ? <Text accessibilityLiveRegion="polite" style={body}>{catalogError}</Text> : null}
      <Action label="Refresh provider category choices" disabled={busy || catalogBusy} onPress={() => void loadCatalog()} />
      {!catalogBusy && catalog && !codes.length ? <Text style={body}>No matching choices on the loaded pages. Try another search or load more provider choices.</Text> : null}
      {codes.length > 10 ? <Text style={body}>Showing the first 10 of {codes.length} loaded matches. Narrow your search by name or description to find the best fit.</Text> : null}
      {codes.slice(0, 10).map(code => <View key={code.id} style={{ gap: 4 }}>
        <Action label={`Choose ${code.name}`} selected={editor.draft.taxCode === code.id} disabled={busy || catalogBusy || !code.supported} onPress={() => { if (code.supported) changeDraft("taxCode", code.id); }} />
        <Text style={body}>{code.description}</Text><Text style={body}>{code.id}</Text>
        {!code.supported ? <Text style={body}>Not supported by this physical-goods checkout. This choice has additional provider requirements the checkout cannot verify.</Text> : null}
      </View>)}
      {catalog?.nextCursor ? <Action label="Load more provider category choices" disabled={busy || catalogBusy} onPress={() => void loadCatalog(catalog.nextCursor)} /> : null}
      <Text style={body}>Selected: {selectedCode?.name ?? "Choose a currently verified provider category"}. Provider codes describe products; they do not prove registration, exemption or marketplace obligations.</Text>
      <Field label="Classification reference / reason" value={editor.draft.professionalBasisReference} maxLength={2000} multiline disabled={busy} onChange={value => changeDraft("professionalBasisReference", value)} />
      <Field label="Coverage reference / reason" value={editor.draft.coverageEvidenceReference} maxLength={2000} multiline disabled={busy} onChange={value => changeDraft("coverageEvidenceReference", value)} />
      <Text style={body}>Record relevant official guidance or another documented basis. Do not enter credentials or private provider payloads. Unknown legal questions stay unqualified; no paid service is required by this form.</Text>
      <Field label="Review expires (YYYY-MM-DD, UTC)" value={editor.draft.date} maxLength={10} disabled={busy} onChange={value => changeDraft("date", value)} />
      <Text style={body}>Current checkout supports tax included in the listed price only. This review cannot change provider pricing or tax settings.</Text>
      {!validDraft ? <Text style={body}>Before continuing: use a category name with at least two letters or numbers, describe its scope (at least 10 characters), choose a supported provider category, add both references and enter a valid future review date.</Text> : null}
      <Action label="I reviewed this scope and its references" selected={checked} disabled={busy || !validDraft} onPress={() => { if (currentView()) { draftVersion.current++; setChecked(value => !value); setConfirm(false); } }} />
      {confirm ? <>
        <Text accessibilityLiveRegion="polite" style={body}>Save {editor.draft.label} as revision {editor.draft.expectedRevision + 1}? This replaces the current review for this category; linked items may need renewed evidence. It does not authorize sales.</Text>
        <Action label="Confirm category review" disabled={busy || !validDraft || !checked} onPress={() => {
          if (!validDraft || !checked || !confirm) return;
          void runWrite(valid => reviewOwnerTaxCategory({ ...editor.draft, expiresAt: expiry(editor.draft.date) }, valid), "Category review saved. Provider, account and location evidence are still separate requirements.");
        }} />
      </> : <Action label="Review category before saving" disabled={busy || !validDraft || !checked} onPress={() => { if (currentView()) setConfirm(true); }} />}
      <Action label="Cancel category editing" disabled={busy} onPress={() => { if (currentView()) clearDrafts(); }} />
    </View> : null}
    {review && current?.queue ? <View style={{ gap: 10 }} testID="owner-tax-request-editor">
      <Text accessibilityRole="header" style={heading}>Review {review.request.title}</Text>
      {review.request.description ? <Text style={body}>{review.request.description}</Text> : null}
      {review.request.variants.map(variant => <Text key={variant.id} style={body}>Option: {variant.sku}{variant.size ? ` · Size ${variant.size}` : ""}{variant.color ? ` · ${variant.color}` : ""}</Text>)}
      <Text style={body}>Creator note: {review.request.note || "No extra description supplied."}</Text>
      <Text style={body}>Choose a category only if its reviewed scope fits. The creator must explicitly select your suggestion; this does not edit or publish their item.</Text>
      {!available.length ? <Text style={body}>No current reviewed category fits yet. Add or renew a category before returning to this request.</Text> : null}
      {available.map(category => <View key={category.id} style={{ gap: 4 }}><Action label={`Suggest ${category.label} revision ${category.revision}`} selected={review.categoryId === category.id} disabled={busy}
        onPress={() => { if (currentView()) { draftVersion.current++; setReview({ ...review, categoryId: category.id }); setConfirm(false); } }} /><Text style={body}>{category.scopeDescription}</Text></View>)}
      <Field label="Review note for this item" value={review.note} maxLength={4000} multiline disabled={busy} onChange={note => { if (currentView()) { draftVersion.current++; setReview({ ...review, note }); setConfirm(false); } }} />
      {confirm ? <Text accessibilityLiveRegion="polite" style={body}>Confirm this category suggestion? Provider and tax evidence are not created by this action.</Text> : null}
      <Action label={confirm ? "Confirm category suggestion" : "Review category suggestion"} disabled={busy || !available.some(category => category.id === review.categoryId) || review.note.trim().length < 3} onPress={() => {
        if (!currentView()) return;
        if (!confirm) { setConfirm(true); return; }
        void runWrite(valid => resolveOwnerTaxRequest(review.request.id, review.categoryId, review.note, valid), "Category suggestion saved. The creator must select it; their item was not changed or published.");
      }} />
      <Action label="Cancel request review" disabled={busy} onPress={() => { if (currentView()) clearDrafts(); }} />
    </View> : null}
    {revoke && current?.queue ? <View style={{ gap: 10 }}>
      <Text accessibilityLiveRegion="polite" style={body}>Revoke {revoke.label} revision {revoke.revision}? It will no longer be a current choice; dependent items may be blocked until reviewed again. Review history is kept.</Text>
      <Action label="Confirm category revocation" disabled={busy} onPress={() => void runWrite(valid => revokeOwnerTaxCategory(revoke.id, valid), "Category revoked. Review history is preserved; no payment settings changed.")} />
      <Action label="Cancel category revocation" disabled={busy} onPress={() => { if (currentView()) clearDrafts(); }} />
    </View> : null}
    {writing ? <Text accessibilityLiveRegion="polite" style={body}>Saving review… Please wait; do not repeat the action.</Text> : null}
  </View>;
}
