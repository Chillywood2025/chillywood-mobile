import React, { useEffect, useRef, useState } from "react";
import { AppState, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ContentInspectionMediaViewer } from "./content-inspection-media-viewer";
import { sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { contentInspection, ContentInspectionError, INSPECTION_TARGET_TYPES, isInspectionContentResponse, isInspectionReason, isInspectionUuid, type InspectionContent, type InspectionContexts, type InspectionScope, type InspectionSubjectTargets, type InspectionTarget } from "../../_lib/contentInspection";

export type ContentInspectionPanelProps = {
  visible: boolean;
  authority: AccountSessionAuthorityBinding | null;
  initialTarget?: InspectionTarget;
  initialSubjectUserId?: string;
  onClose: () => void;
};
const emptyTarget: InspectionTarget = { targetType: "profile_post", targetId: "" };

// All sensitive state is scoped to one mounted account/session and one selection.
// The outer key destroys this state synchronously when identity or entry target changes.
export function useContentInspectionPanel(authority: AccountSessionAuthorityBinding, initialTarget: InspectionTarget = emptyTarget, initialSubjectUserId = "") {
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState(initialTarget);
  const [contextId, setContextId] = useState("");
  const [subjectUserId, setSubjectUserId] = useState(initialSubjectUserId);
  const [subjectTargets, setSubjectTargets] = useState<InspectionSubjectTargets | null>(null);
  const [contexts, setContexts] = useState<InspectionContexts | null>(null);
  const [scope, setScope] = useState<InspectionScope | null>(null);
  const [result, setResult] = useState<InspectionContent | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [retainedSelection, setRetainedSelection] = useState(false);
  const [grantee, setGrantee] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [disabled, setDisabled] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  const retainedMediaEligible = result?.availability === "available_deleted" && result.mediaAvailability === "prepare_required"
    && result.retainedMediaAvailability === "prepare_required" && !!result.retentionExpiresAt && Date.parse(result.retentionExpiresAt) > Date.now();
  const clear = () => { generation.current++; pending.current = false; setBusy(false); setResult(null); setMediaOpen(false); setRetainedSelection(false); setSubjectTargets(null); setReason(""); setGrantee(""); setExpiry(""); setMessage(""); };
  useEffect(() => {
    const lifetime = generation;
    mounted.current = true;
    return () => { mounted.current = false; lifetime.current++; };
  }, []);
  useEffect(() => {
    const retentionDeadline = result?.availability === "available_deleted" && result.retentionExpiresAt ? Date.parse(result.retentionExpiresAt) : Infinity;
    const matchingGrants = contexts?.canCreateContext === false ? scope?.grants.filter(grant => !grant.revokedAt && grant.granteeUserId === authority.userId && grant.targetType === target.targetType && grant.targetId === target.targetId) ?? [] : [];
    const grantDeadline = matchingGrants.length ? Math.max(...matchingGrants.map(grant => Date.parse(grant.expiresAt))) : Infinity;
    const expiresAt = Math.min(retentionDeadline, grantDeadline);
    if (!Number.isFinite(expiresAt)) return;
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        generation.current++; pending.current = false; setBusy(false); setResult(null); setMediaOpen(false);
        if (grantDeadline <= Date.now()) { setScope(null); setReason(""); setGrantee(""); setExpiry(""); setSubjectTargets(null); setMessage("Your scoped grant has expired. Enter a reason and reload scope to check current access."); }
        else setMessage("The retained deletion has expired. Its content is no longer available.");
      }
      else timer = setTimeout(checkExpiry, Math.min(remaining, 3600000));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [result, contexts, scope, authority.userId, target.targetType, target.targetId]);
  const run = async <T,>(operation: () => Promise<T>, accept: (value: T) => void) => {
    if (pending.current || disabled) return;
    const token = ++generation.current;
    pending.current = true; setBusy(true); setResult(null); setMediaOpen(false); setMessage("");
    try {
      const value = await operation();
      if (mounted.current && token === generation.current) accept(value);
    } catch (error) {
      if (mounted.current && token === generation.current) {
        setResult(null); setScope(null); setSubjectTargets(null); setGrantee(""); setExpiry("");
        const safe = error instanceof ContentInspectionError ? error : new ContentInspectionError("unavailable");
        setMessage(safe.message);
        if (["denied", "account_changed", "disabled"].includes(safe.code)) { setContexts(null); setReason(""); }
        if (safe.code === "disabled") setDisabled(true);
      }
    } finally {
      if (mounted.current && token === generation.current) { pending.current = false; setBusy(false); }
    }
  };
  return {
    reason, target, contextId, contexts, scope, result, grantee, expiry, busy, message, disabled, subjectUserId, subjectTargets, mediaOpen, retainedSelection, retainedMediaEligible,
    clear,
    changeReason(value: string) { generation.current++; pending.current = false; setBusy(false); setResult(null); setMediaOpen(false); setReason(value); setMessage(""); },
    openMedia() {
      if (!pending.current && !disabled && (!retainedSelection || retainedMediaEligible) && isInspectionReason(reason) && isInspectionUuid(contextId)
        && ["creator_video", "social_attachment"].includes(target.targetType)
        && scope?.targets.some(item => item.targetId === target.targetId && item.targetType === target.targetType)) setMediaOpen(true);
    },
    closeMedia() { setMediaOpen(false); },
    changeTarget(value: InspectionTarget) { clear(); setTarget({ targetType: value.targetType, targetId: value.targetId }); setMessage("Target selection changed. Previous content and browse results were cleared. Enter a fresh reason to continue."); },
    changeContext(value: string) { clear(); setContextId(value); setScope(null); setMessage("Review context selected. Enter a fresh reason, then load its scoped targets and grants."); },
    changeSubject(value: string) { clear(); setSubjectUserId(value); setContextId(""); setScope(null); setTarget({ ...target, targetId: "" }); setMessage("User selection changed. Enter a fresh reason, then browse their current items."); },
    setGrantee, setExpiry,
    list(more = false) { return run(() => contentInspection.listContexts(authority, reason, more ? contexts?.nextCursor : null), value => setContexts(more && contexts ? { ...value, contexts: [...contexts.contexts, ...value.contexts] } : value)); },
    browse(more = false) {
      if (!contexts?.canBrowseUsers) return;
      return run(() => contentInspection.listSubjectTargets(authority, subjectUserId, target.targetType, reason, more ? subjectTargets?.nextCursor : null), value => {
        if (value.subjectUserId !== subjectUserId || value.targetType !== target.targetType) throw new ContentInspectionError("unavailable");
        setSubjectTargets(more && subjectTargets ? { ...value, targets: [...subjectTargets.targets, ...value.targets] } : value);
      });
    },
    create() { return run(() => contentInspection.createContext(authority, reason, target), value => { clear(); setContextId(value.contextId); setScope(null); setMessage("Context created. Enter a reason to load its exact scope."); }); },
    loadScope() { return run(() => contentInspection.scope(authority, contextId, reason), setScope); },
    read() { return run(() => contentInspection.read(authority, contextId, target, reason), value => {
      if (!isInspectionContentResponse(value) || value.contextId !== contextId || value.targetType !== target.targetType || value.targetId !== target.targetId) throw new ContentInspectionError("unavailable");
      setRetainedSelection(value.availability === "available_deleted");
      setResult(value);
    }); },
    grant() { return run(() => contentInspection.grant(authority, contextId, target, grantee, expiry, reason), () => { setScope(null); setGrantee(""); setExpiry(""); setMessage("Grant created. Reload scope to verify its status."); }); },
    revoke(grantId: string) { return run(() => contentInspection.revoke(authority, grantId, reason), () => { setScope(null); setMessage("Grant revoked. Reload scope to verify its status."); }); },
    closeContext() { return run(() => contentInspection.closeContext(authority, contextId, reason), () => { clear(); setContextId(""); setScope(null); setContexts(null); setMessage("Review context closed. Inspection access through this context has ended."); }); },
  };
}

function InspectionBody({ authority, initialTarget, initialSubjectUserId, onClose }: { authority: AccountSessionAuthorityBinding; initialTarget?: InspectionTarget; initialSubjectUserId?: string; onClose: () => void }) {
  const state = useContentInspectionPanel(authority, initialTarget, initialSubjectUserId);
  const scroll = useRef<ScrollView>(null);
  const browseOffset = useRef(0);
  const close = () => { state.clear(); onClose(); };
  const canReason = isInspectionReason(state.reason) && !state.busy && !state.disabled;
  const validTarget = isInspectionUuid(state.target.targetId);
  const canScope = canReason && isInspectionUuid(state.contextId);
  const exactScopedTarget = state.scope?.targets.some(t => t.targetId === state.target.targetId && t.targetType === state.target.targetType);
  const selectedContext = state.contexts?.contexts.find(context => context.contextId === state.contextId);
  const nextStep = !isInspectionReason(state.reason)
    ? "Enter a reason above to continue. Changing the user, target or context clears the previous reason and content."
    : !state.contexts ? "Load review contexts to check your access and available actions."
    : !isInspectionUuid(state.contextId)
      ? state.contexts.canCreateContext
        ? "Choose a target, then create a review context for it or select an existing open context."
        : "Select an open review context to load the targets assigned to you."
      : !state.scope ? "Load scoped targets and grants to check the selected context."
      : !exactScopedTarget ? "Select one of this context’s scoped targets before inspecting."
      : "Inspect the selected content. The result will identify current content or an eligible retained deletion.";
  const refreshBrowse = () => {
    void state.browse();
    scroll.current?.scrollTo({ y: browseOffset.current, animated: false });
  };
  const button = (label: string, action: () => void, enabled = true) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={action} style={[styles.button, !enabled && styles.disabled]}><Text style={styles.text}>{label}</Text></TouchableOpacity>;
  const input = (label: string, value: string, change: (text: string) => void, maxLength = 500) => <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor="#9AA4B9" value={value} onChangeText={change} maxLength={maxLength} autoCorrect={false} autoCapitalize="none" style={styles.input} />;
  return <SafeAreaView style={styles.panel}>
    <View style={[styles.row, styles.header]}><Text accessibilityRole="header" style={styles.heading}>Stored content inspection</Text>{button("Close inspection", close)}</View>
    <ScrollView ref={scroll} style={styles.panel} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.muted}>Close inspection hides this screen. It does not end a review context or revoke anyone’s access.</Text>
    <Text style={styles.muted}>Current stored text and supported original media. Access requires an active context and an explicit reason. Eligible deleted text is shown only when the server returns a retained record. No edited-version history is retained by this feature.</Text>
    <Text style={styles.muted}>{state.contexts?.accessAuditMode === "owner_view_exempt" ? "Your exact Owner views are excluded from the app inspection-access log." : state.contexts?.accessAuditMode === "staff_view_logged" ? "Your staff inspection access is logged." : "Inspection access follows the server audit policy."} Grant, revoke, context and security actions remain logged.</Text>
    <Text style={styles.muted}>Deletion-only retention is limited to 30 days and is disabled by default; this screen does not activate capture. Missing originals cannot be recovered by granting access. Retained original media can be inspected only when the server verifies its availability.</Text>
    <View style={styles.card} testID="content-inspection-selection">
      <Text accessibilityRole="header" style={styles.text}>Current selection</Text>
      {state.subjectUserId !== "" && <Text selectable style={styles.muted}>User: {state.subjectUserId}</Text>}
      <Text selectable style={styles.muted}>Review context: {state.contextId ? `${selectedContext?.purpose ? `${selectedContext.purpose} · ` : ""}${state.contextId}` : "None selected"}</Text>
      <Text selectable style={styles.muted}>Target: {state.target.targetType.replaceAll("_", " ")} · {validTarget ? state.target.targetId : "None selected"}</Text>
    </View>
    {input("Reason or new context purpose (6–500 characters)", state.reason, state.changeReason)}
    {!state.disabled && <Text testID="content-inspection-next-step" style={styles.muted}>{nextStep}</Text>}
    {button("Load review contexts", () => { void state.list(); }, canReason)}
    {state.contexts?.contexts.length === 0 && <Text style={styles.muted}>{state.contexts.canCreateContext ? "No review contexts are available. Choose an exact target below to create one." : "No review contexts are available to you. Ask the Owner for access to the exact content you need."}</Text>}
    {state.contexts?.contexts.map(context => <View key={context.contextId} style={styles.card}><Text style={styles.text}>{context.purpose}</Text><Text selectable style={styles.muted}>{context.contextId} · {context.status}</Text>{button("Select context " + context.contextId, () => state.changeContext(context.contextId), context.status === "open")}</View>)}
    {state.contexts?.hasMore && button("More contexts", () => { void state.list(true); }, canReason)}
    <Text style={styles.text}>Content type</Text>
    <View style={styles.row}>{INSPECTION_TARGET_TYPES.map(type => <TouchableOpacity key={type} accessibilityRole="radio" accessibilityState={{ checked: state.target.targetType === type }} accessibilityLabel={type.replaceAll("_", " ")} onPress={() => state.changeTarget({ targetType: type, targetId: "" })} style={[styles.button, state.target.targetType === type && styles.selected]}><Text style={styles.text}>{type.replaceAll("_", " ")}</Text></TouchableOpacity>)}</View>
    {state.contexts?.canBrowseUsers && <View style={styles.card} onLayout={event => { browseOffset.current = event.nativeEvent.layout.y; }}>
      <Text accessibilityRole="header" style={styles.heading}>Browse a user’s current items</Text>
      <Text style={styles.muted}>The selected user is supplied by Users, or enter their exact user UUID. Choose a content type above, then browse its metadata. This list contains current source records only; it does not search content text or retained deletions. For retained content, use an existing review context or its exact target UUID.</Text>
      {input("User UUID to browse", state.subjectUserId, state.changeSubject, 36)}
      {button("Browse user content", () => { void state.browse(); }, canReason && isInspectionUuid(state.subjectUserId))}
      <Text style={styles.muted}>Selecting an item clears the list and reason. Enter a fresh reason to continue. Browsing again checks current access and reloads the list.</Text>
      {state.subjectTargets?.targets.map(item => <View key={item.targetId} style={styles.card}><Text style={styles.text}>{item.label} · {item.createdAt}</Text><Text selectable style={styles.muted}>{item.targetId}</Text>{button("Select stored item " + item.targetId, () => state.changeTarget(item))}</View>)}
      {state.subjectTargets && state.subjectTargets.targets.length === 0 && <Text style={styles.muted}>No currently stored items of this type were found for this user.</Text>}
      {state.subjectTargets?.hasMore && button("More user content", () => { void state.browse(true); }, canReason)}
    </View>}
    {input("Exact target UUID", state.target.targetId, targetId => state.changeTarget({ ...state.target, targetId }), 36)}
    {state.contexts?.canCreateContext && button("Create context for this exact target", () => { void state.create(); }, canReason && validTarget)}
    {state.contextId !== "" && <><Text selectable style={styles.text}>Selected context: {state.contextId}</Text>{button("Load scoped targets and grants", () => { void state.loadScope(); }, canScope)}</>}
    {state.scope?.targets.length === 0 && <Text style={styles.muted}>No scoped targets are available in this context. Select another open context or reload its scope to check current access.</Text>}
    {state.scope?.targets.map(t => <View key={`${t.targetType}:${t.targetId}`} style={styles.card}><Text selectable style={styles.muted}>{t.targetType} · {t.targetId}</Text>{button("Select target " + t.targetId, () => state.changeTarget(t))}</View>)}
    {button("Inspect selected content", () => { void state.read(); }, canScope && validTarget && !!exactScopedTarget)}
    {state.result && <View style={styles.card} testID="content-inspection-result"><Text style={styles.text}>{state.result.availability === "available" ? "Current stored content" : state.result.availability === "available_deleted" ? "Retained deleted content (not restored)" : state.result.availability === "media_only" ? "Media-only target. Open original media inspection below when supported." : "No current or eligible retained content is available"}</Text>{state.result.availability === "available_deleted" && <Text style={styles.muted}>Deleted: {state.result.deletedAt} · Retention expires: {state.result.retentionExpiresAt} · 30 days from deletion. {state.retainedMediaEligible ? "A verified retained original may be prepared below; access ends no later than retention expiry." : "Retained media is unsupported or unavailable."}</Text>}<Text style={styles.muted}>Version: {state.result.storedVersion ?? "unavailable"} · Updated: {state.result.sourceUpdatedAt ?? "unknown"}</Text><Text style={styles.muted}>{state.result.restrictionLabels.join(" · ")}</Text>{["available", "available_deleted"].includes(state.result.availability) && state.result.content && ("body" in state.result.content ? <Text selectable style={styles.text}>{state.result.content.body}</Text> : <><Text selectable style={styles.text}>{state.result.content.title}</Text><Text selectable style={styles.text}>{state.result.content.description}</Text></>)}</View>}
    {["creator_video", "social_attachment"].includes(state.target.targetType) && (!state.retainedSelection || state.retainedMediaEligible) && button("Open original media inspection", state.openMedia, canScope && !!exactScopedTarget)}
    {state.mediaOpen && <View style={styles.card}>{button("Close original media inspection", state.closeMedia)}<ContentInspectionMediaViewer key={`${state.contextId}:${state.target.targetType}:${state.target.targetId}:${state.reason}`} authority={authority} contextId={state.contextId} target={state.target} reason={state.reason} /></View>}
    {state.contexts?.canBrowseUsers && isInspectionUuid(state.subjectUserId) && validTarget && button("Refresh user content list", refreshBrowse, canReason)}
    {state.scope?.grantsHasMore && <Text accessibilityRole="alert" style={styles.muted}>Only the 200 newest grants are shown. Older grant history is not loaded.</Text>}
    {state.contexts?.canDelegate && <View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Owner: scoped Admin access</Text><Text style={styles.muted}>Existing Admin only. Exact context and target. Expiry is mandatory and at most 24 hours. The server verifies all authority; a form does not grant permission.</Text>{input("Existing Admin user UUID", state.grantee, state.setGrantee, 36)}{input("Expiry ISO timestamp, including timezone", state.expiry, state.setExpiry, 40)}{button("Grant exact target access", () => { void state.grant(); }, canScope && !!exactScopedTarget && isInspectionUuid(state.grantee) && Date.parse(state.expiry) > Date.now() && Date.parse(state.expiry) <= Date.now() + 86400000)}{state.scope?.grants.map(grant => <View key={grant.grantId} style={styles.card}><Text selectable style={styles.muted}>{grant.granteeUserId} · {grant.targetType} · {grant.targetId} · expires {grant.expiresAt} · {grant.revokedAt ? "revoked" : "not revoked"}</Text>{button("Revoke grant " + grant.grantId, () => { void state.revoke(grant.grantId); }, canScope && !grant.revokedAt)}</View>)}</View>}
    {state.contexts?.canCreateContext && state.contextId !== "" && <View style={styles.card}>
      <Text style={styles.muted}>Ending this review context stops inspection access through it for everyone assigned to it. To leave the screen without ending access, use Close inspection.</Text>
      {button("End access to selected review context", () => { void state.closeContext(); }, canScope)}
    </View>}
    </ScrollView>
    {(state.busy || state.message !== "") && <View style={styles.status} testID="content-inspection-status">
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.muted}>{state.busy ? "Checking current authority…" : state.message}</Text>
    </View>}
  </SafeAreaView>;
}

export function ContentInspectionPanel({ visible, authority, initialTarget, initialSubjectUserId, onClose }: ContentInspectionPanelProps) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { if (!visible) setBlocked(false); }, [visible]);
  useEffect(() => {
    if (!visible) return;
    const retire = () => { setBlocked(true); onClose(); };
    const subscription = AppState.addEventListener("change", next => { if (next !== "active") retire(); });
    const unsubscribe = subscribeToAccountSessionAuthority(next => { if (!sameAccountSessionAuthority(authority, next)) retire(); });
    if (AppState.currentState && AppState.currentState !== "active") retire();
    return () => { subscription.remove(); unsubscribe(); };
  }, [visible, authority, onClose]);
  if (!visible || blocked || !authority || authority.restoreOnly) return null;
  const key = `${authority.userId}:${authority.accountId}:${authority.sessionGeneration}:${initialTarget?.targetType ?? ""}:${initialTarget?.targetId ?? ""}:${initialSubjectUserId ?? ""}`;
  return <Modal visible animationType="none" onRequestClose={onClose} presentationStyle="fullScreen"><InspectionBody key={key} authority={authority} initialTarget={initialTarget} initialSubjectUserId={initialSubjectUserId} onClose={onClose} /></Modal>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, backgroundColor: "#10131A" }, content: { padding: 24, gap: 12, paddingBottom: 48 },
  header: { paddingHorizontal: 24, paddingVertical: 12 }, status: { paddingHorizontal: 24, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#333B4A" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, heading: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", flexShrink: 1 },
  text: { color: "#FFFFFF", fontSize: 15 }, muted: { color: "#C7D0DF", fontSize: 14 },
  input: { color: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, padding: 12, minHeight: 48 },
  button: { backgroundColor: "rgba(255,255,255,0.08)", padding: 12, borderRadius: 8, minHeight: 44, justifyContent: "center" },
  selected: { backgroundColor: "#B91C32" }, disabled: { opacity: 0.4 }, card: { backgroundColor: "rgba(255,255,255,0.04)", padding: 12, borderRadius: 8, gap: 8 },
});
