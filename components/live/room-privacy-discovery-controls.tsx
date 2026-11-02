import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, ImageBackground, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { useSession } from "../../_lib/session";
import { hasPlatformRoleMembership, readMyPlatformRoleMemberships } from "../../_lib/moderation";
import type { WatchPartyState } from "../../_lib/watchParty";
import { getWatchPartyHostSettingsErrorMessage, hasVersionedWatchPartyHostSettings, isWatchPartyDiscoveryEnabled, isWatchPartyHostSettingsPending, readWatchPartyHostSettings,
  sameWatchPartyHostSettingsRoom, setWatchPartyHostSettings, type WatchPartyHostSettings,
  subscribeToWatchPartyHostSettingsPending, type WatchPartyHostSettingsResult } from "../../_lib/watchPartyHostSettings";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

type Sheet = {
  retired: boolean; busy: boolean; reading: boolean; room: WatchPartyState | null;
  draft: WatchPartyHostSettings | null; confirm: boolean; error: string | null; message: string | null;
  isOwner: boolean; ownerConsent: boolean; readVersion: number;
};
const audienceLabel = (value: WatchPartyState["discoveryVisibility"]) => value === "circle" ? "Chi'lly Circle" : "Eligible people";
const settingsFrom = (room: WatchPartyState): WatchPartyHostSettings => ({ joinPolicy: room.joinPolicy,
  discoveryVisibility: room.discoveryVisibility, discoveryTitle: room.discoveryTitle, discoveryPaused: room.discoveryPaused ?? undefined });

/** One revision-bound editor for Party Room, Live Room and Live Stage. No draft
 * selection changes a room, and no local optimistic flag claims it is listed. */
export function RoomPrivacyDiscoveryControls({ room, active, eventManaged = false, onReadback, onPublished, onOpenChange, publicationStatus }: {
  room: WatchPartyState | null; active: boolean; eventManaged?: boolean;
  onReadback: (room: WatchPartyState) => void;
  onPublished?: (result: WatchPartyHostSettingsResult) => void;
  onOpenChange?: (open: boolean) => void;
  publicationStatus?: string;
}) {
  const { authority, authorityStatus } = useSession();
  const insets = useSafeAreaInsets();
  const key = JSON.stringify([room?.partyId, room?.hostUserId, room?.roomGeneration, room?.roomType,
    room?.sourceType, room?.sourceId, room?.isActive, authority?.userId, authority?.accountId,
    authority?.sessionGeneration, authority?.state, authority?.restoreOnly, authorityStatus, active, eventManaged]);
  const owner = useMemo(() => ({ key, retired: false }), [key]);
  const latest = useRef({ owner, room, authority, onReadback, onPublished, onOpenChange });
  latest.current = { owner, room, authority, onReadback, onPublished, onOpenChange };
  const sheetRef = useRef<Sheet | null>(null);
  const [, redraw] = useState(0);
  const bump = () => redraw(n => n + 1);
  const ownsRoom = !!authority && authorityStatus === "active" && authority.state === "ACTIVE" && !authority.restoreOnly
    && !!room?.isActive && room.hostUserId === authority.userId;
  const current = () => latest.current.owner === owner && !owner.retired && ownsRoom && active
    && AppState.currentState === "active" && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  const close = () => {
    if (latest.current.owner !== owner || !sheet || sheetRef.current !== sheet) return;
    if (sheetRef.current) sheetRef.current.retired = true;
    sheetRef.current = null; latest.current.onOpenChange?.(false); bump();
  };
  useEffect(() => {
    owner.retired = false;
    const boundAuthority = latest.current.authority;
    const retire = () => {
      owner.retired = true;
      if (sheetRef.current) { sheetRef.current.retired = true; latest.current.onOpenChange?.(false); }
      sheetRef.current = null; bump();
    };
    const unsubscribe = subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(boundAuthority, next)) retire();
    });
    const pendingUnsubscribe = subscribeToWatchPartyHostSettingsPending(() => {
      if (latest.current.owner === owner && !owner.retired) bump();
    });
    const app = AppState.addEventListener("change", state => {
      if (state !== "active") retire();
      else if (latest.current.owner === owner) { owner.retired = false; bump(); }
    });
    // A new room/account/focus lifetime discards all earlier drafts.
    if (sheetRef.current) { sheetRef.current.retired = true; latest.current.onOpenChange?.(false); }
    sheetRef.current = null;
    return () => {
      owner.retired = true; unsubscribe(); pendingUnsubscribe(); app.remove();
      if (sheetRef.current && latest.current.owner === owner) latest.current.onOpenChange?.(false);
    };
  }, [owner]);

  const sheet = sheetRef.current;
  const sheetCurrent = (candidate: Sheet) => current() && !candidate.retired && sheetRef.current === candidate;
  const read = async (candidate: Sheet) => {
    if (!room || !authority || !sheetCurrent(candidate) || candidate.busy || candidate.reading) return;
    candidate.reading = true; candidate.error = null; candidate.confirm = false; bump();
    const readVersion = ++candidate.readVersion;
    const readCurrent = () => sheetCurrent(candidate) && candidate.readVersion === readVersion;
    const timer = setTimeout(() => {
      if (!readCurrent()) return;
      candidate.readVersion += 1; candidate.reading = false; candidate.room = null; candidate.draft = null;
      candidate.error = "Current settings took too long to load. Check your connection and reload; no changes were sent.";
      bump();
    }, 12_000);
    try {
      const [fresh, roles] = await Promise.all([
        readWatchPartyHostSettings(room, authority, readCurrent), readMyPlatformRoleMemberships(),
      ]);
      if (!readCurrent()) return;
      if (!fresh) {
        candidate.room = null; candidate.draft = null;
        candidate.error = "Current room settings could not be verified. The room may have ended or changed. Reopen the room or retry.";
      } else {
        candidate.room = fresh; candidate.draft = settingsFrom(fresh);
        candidate.isOwner = hasPlatformRoleMembership(roles, ["owner"]); candidate.ownerConsent = false;
        latest.current.onReadback(fresh);
      }
    } catch {
      if (readCurrent()) { candidate.room = null; candidate.draft = null; candidate.error = "Could not load current settings. Check your connection and retry."; }
    } finally {
      clearTimeout(timer);
      if (readCurrent()) { candidate.reading = false; bump(); }
    }
  };
  const open = () => {
    if (!current() || eventManaged || !hasVersionedWatchPartyHostSettings(room) || sheetRef.current) return;
    const candidate: Sheet = { retired: false, busy: false, reading: false, room: null, draft: null,
      confirm: false, error: null, message: null, isOwner: false, ownerConsent: false, readVersion: 0 };
    sheetRef.current = candidate; latest.current.onOpenChange?.(true); void read(candidate);
  };
  const select = (changes: Partial<WatchPartyHostSettings>) => {
    if (!sheet || !sheetCurrent(sheet) || sheet.busy || sheet.reading || !sheet.draft || !sheet.room
      || isWatchPartyHostSettingsPending(sheet.room)) return;
    sheet.draft = { ...sheet.draft, ...changes }; sheet.confirm = false; sheet.error = null; sheet.message = null; bump();
    if (!isWatchPartyDiscoveryEnabled(sheet.draft)) sheet.ownerConsent = false;
  };
  const save = async () => {
    if (!sheet || !sheetCurrent(sheet) || !authority || sheet.busy || sheet.reading || !sheet.room || !sheet.draft
      || isWatchPartyHostSettingsPending(sheet.room)) return;
    const expected = sheet.room, requested = { ...sheet.draft };
    const listingEnabled = isWatchPartyDiscoveryEnabled(requested);
    if (sheet.isOwner && listingEnabled && !requested.discoveryTitle?.trim()) return;
    const broader = (listingEnabled && (!isWatchPartyDiscoveryEnabled(expected) || requested.discoveryVisibility !== expected.discoveryVisibility))
      || (expected.discoveryVisibility === "circle" && requested.discoveryVisibility !== "circle")
      || (expected.joinPolicy === "locked" && requested.joinPolicy === "open") || sheet.ownerConsent;
    if (broader && !sheet.confirm) { sheet.confirm = true; bump(); return; }
    sheet.busy = true; sheet.error = null; sheet.message = "Saving and checking the server…"; bump();
    const timer = setTimeout(() => {
      if (sheetCurrent(sheet)) {
        sheet.message = "The save is still awaiting a server response. Do not retry. You can close this sheet; reopening will read current settings.";
        bump();
      }
    }, 12_000);
    try {
      const result = await setWatchPartyHostSettings(expected, requested, authority, () => sheetCurrent(sheet), {
        publish: true, allowOwnerDiscovery: sheet.isOwner && sheet.ownerConsent && sheet.confirm && listingEnabled,
      });
      if (!sheetCurrent(sheet)) return;
      if (!result || !sameWatchPartyHostSettingsRoom(expected, result.room)
        || !sameWatchPartyHostSettingsRoom(latest.current.room, result.room)
        || Number(latest.current.room?.hostSettingsRevision) > Number(result.room.hostSettingsRevision)) {
        sheet.room = null; sheet.draft = null; sheet.confirm = false;
        sheet.error = "Save not confirmed. Reload current settings before trying again; no change is assumed.";
        sheet.message = null;
      } else {
        sheet.room = result.room; sheet.draft = settingsFrom(result.room); sheet.confirm = false; sheet.ownerConsent = false;
        sheet.message = !isWatchPartyDiscoveryEnabled(result.room)
          ? `Saved on the server. Discovery is off; ${result.room.discoveryVisibility === "circle" ? "Circle-only entry is unchanged" : "room entry rules still apply"}.`
          : result.published ? `Saved. ${audienceLabel(result.room.discoveryVisibility)} listing confirmed.`
            : sheet.isOwner && !result.ownerDiscoveryConsent
              ? "Audience saved, but this owner session remains hidden. Explicitly allow this room below to request its live listing."
              : "Saved. Listing is not confirmed yet; an active eligible room connection is required. Check the room's listing status.";
        latest.current.onReadback(result.room);
        latest.current.onPublished?.(result);
      }
    } catch (error) {
      if (sheetCurrent(sheet)) {
        sheet.room = null; sheet.draft = null; sheet.confirm = false; sheet.message = null;
        sheet.error = getWatchPartyHostSettingsErrorMessage(error) ?? "Save not confirmed. Reload current settings before trying again.";
      }
    } finally {
      clearTimeout(timer); sheet.busy = false;
      if (latest.current.owner === owner && !owner.retired) bump();
    }
  };

  if (!ownsRoom || !active) return null;
  if (eventManaged) return <Text style={styles.detail} testID="room-discovery-event-managed">Event-managed room: discovery stays off and room entry stays locked. Event access is managed separately.</Text>;
  const supported = hasVersionedWatchPartyHostSettings(room);
  const visible = !!sheet && current() && !sheet.retired;
  const pending = !!room && isWatchPartyHostSettingsPending(room);
  const disabled = !sheet?.draft || sheet.busy || sheet.reading || pending;
  const changed = !!sheet?.draft && !!sheet.room && (sheet.draft.joinPolicy !== sheet.room.joinPolicy
    || sheet.draft.discoveryVisibility !== sheet.room.discoveryVisibility || sheet.draft.discoveryPaused !== sheet.room.discoveryPaused
    || sheet.draft.discoveryTitle !== sheet.room.discoveryTitle || sheet.ownerConsent);
  const missingOwnerTitle = !!sheet?.isOwner && !!sheet.draft && isWatchPartyDiscoveryEnabled(sheet.draft) && !sheet.draft.discoveryTitle?.trim();
  return <View>
    <Pressable testID="room-privacy-discovery-open" accessibilityRole="button" accessibilityLabel="Room entry and live discovery"
      accessibilityState={{ disabled: !supported }} disabled={!supported} onPress={open} style={[styles.entry, !supported && styles.disabled]}>
      <MaterialIcons name="visibility" size={18} color={CHILLYWOOD_VISUAL.accentCrimson} />
      <View style={styles.flex}><Text style={styles.label}>Privacy &amp; discovery</Text>
        <Text style={styles.detail}>Entry: {room?.joinPolicy === "locked" ? "Locked" : "Open"} · Audience: {audienceLabel(room!.discoveryVisibility)} · Discovery: {typeof room?.discoveryPaused !== "boolean" ? "Unverified" : isWatchPartyDiscoveryEnabled(room) ? "On" : "Off"}</Text></View>
      <MaterialIcons name="chevron-right" size={20} color={CHILLYWOOD_VISUAL.textPrimary} />
    </Pressable>
    {!supported ? <Text style={styles.detail}>Host settings are unavailable until the server can verify this room. Existing privacy is unchanged.</Text> : null}
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={close}>
      <ImageBackground source={require("../../assets/images/chillywood-branded-background.png")} style={styles.background} resizeMode="cover">
        <View style={[styles.scrim, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Back without further changes" testID="room-discovery-back" style={styles.back}>
              <MaterialIcons name="arrow-back" size={24} color={CHILLYWOOD_VISUAL.textPrimary} />
            </Pressable>
            <Text style={styles.title}>Privacy &amp; discovery</Text>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.detail}>Only the room host can change these settings. Speakers and cohosts cannot change the audience.</Text>
            <Text style={styles.detail} accessibilityLiveRegion="polite" testID="room-discovery-current-listing">{publicationStatus ?? "Current listing status has not been confirmed."}</Text>
            {sheet?.reading ? <Text style={styles.detail} accessibilityLiveRegion="polite">Reading current server settings…</Text> : null}
            {sheet?.draft ? <>
              <Text style={styles.heading}>Room entry</Text>
              <Text style={styles.detail}>Open allows new eligible people to enter. Locked stops new members; it does not remove existing members or hide the listing. Premium, tickets, blocks and content access still apply.</Text>
              <View style={styles.row}>{(["open", "locked"] as const).map(value => <Pressable key={value}
                testID={`room-entry-${value}`} accessibilityRole="radio" accessibilityLabel={value === "open" ? "Open room entry" : "Locked room entry"}
                accessibilityState={{ selected: sheet.draft?.joinPolicy === value, disabled }} disabled={disabled}
                onPress={() => select({ joinPolicy: value })} style={[styles.option, sheet.draft?.joinPolicy === value && styles.selected, disabled && styles.disabled]}>
                <Text style={styles.label}>{value === "open" ? "Open" : "Locked"}</Text></Pressable>)}</View>
              <Text style={styles.heading}>Room audience</Text>
              <Text style={styles.detail}>Choose who is eligible to enter. Changing the audience while discovery is off does not publish a listing. Turning discovery off never removes Circle-only entry.</Text>
              {([
                ["circle", "Chi'lly Circle", "Only your current Circle can enter, including with a saved room link or code. Followers are not automatically Circle members. When discovery is on, only eligible Circle members can find it."],
                ["public", "Eligible people · Public audience", "People outside your Circle may enter with a link or code if room-entry and content access allow it. They can discover the room only when live discovery is on."],
              ] as const).map(([value, label, description]) => <Pressable key={value} testID={`room-discovery-${value}`}
                accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: value === "circle" ? sheet.draft?.discoveryVisibility === "circle" : sheet.draft?.discoveryVisibility !== "circle", disabled }} disabled={disabled}
                onPress={() => select({ discoveryVisibility: value, discoveryPaused: !isWatchPartyDiscoveryEnabled(sheet.draft!) })}
                style={[styles.option, (value === "circle" ? sheet.draft?.discoveryVisibility === "circle" : sheet.draft?.discoveryVisibility !== "circle") && styles.selected, disabled && styles.disabled]}>
                <Text style={styles.label}>{label}</Text><Text style={styles.detail}>{description}</Text></Pressable>)}
              <Text style={styles.heading}>Live discovery</Text>
              <Text style={styles.detail}>Off means not listed on Home, Live, search or profiles. It preserves the audience and room-entry rules, and does not make a room invitation-only.</Text>
              {([false, true] as const).map(enabled => <Pressable key={String(enabled)} testID={enabled ? "room-discovery-on" : "room-discovery-private"}
                accessibilityRole="radio" accessibilityLabel={enabled ? "Live discovery on" : "Off · not listed"}
                accessibilityState={{ selected: isWatchPartyDiscoveryEnabled(sheet.draft!) === enabled, disabled }} disabled={disabled}
                onPress={() => select({ discoveryPaused: !enabled,
                  ...(enabled && sheet.draft?.discoveryVisibility === "private" ? { discoveryVisibility: "public" } : {}) })}
                style={[styles.option, isWatchPartyDiscoveryEnabled(sheet.draft!) === enabled && styles.selected, disabled && styles.disabled]}>
                <Text style={styles.label}>{enabled ? "On · list for the selected audience" : "Off · not listed"}</Text></Pressable>)}
              <Text style={styles.heading}>Room title</Text>
              <TextInput testID="room-discovery-title" accessibilityLabel="Room discovery title" maxLength={140}
                value={sheet.draft.discoveryTitle ?? ""} editable={!disabled} onChangeText={value => select({ discoveryTitle: value })}
                placeholder="Name this live session" placeholderTextColor={CHILLYWOOD_VISUAL.textMuted} style={[styles.option, styles.label]} />
              {sheet.isOwner && isWatchPartyDiscoveryEnabled(sheet.draft) ? <View style={styles.confirm}>
                <Text style={styles.heading}>Your owner session is hidden by default</Text>
                <Text style={styles.detail}>You can explicitly share only this room&apos;s live card and current room display name with the selected audience. Your owner profile, admin activity and other sessions stay hidden. Circle requires actual current eligible Circle members; followers do not qualify automatically.</Text>
                <Text style={styles.detail}>This checkbox authorizes the next Save only; it is not a current-status toggle. Existing room-only consent may already be active. Check the listing status above, or turn discovery Off to hide this room.</Text>
                <Pressable testID="room-discovery-owner-consent" accessibilityRole="checkbox" accessibilityLabel="Allow only this owner room to be discoverable"
                  accessibilityState={{ checked: sheet.ownerConsent, disabled }} disabled={disabled}
                  onPress={() => { if (sheetCurrent(sheet) && !sheet.busy && !sheet.reading && !pending) { sheet.ownerConsent = !sheet.ownerConsent; sheet.confirm = false; bump(); } }}
                  style={[styles.option, sheet.ownerConsent && styles.selected]}>
                  <Text style={styles.label}>{sheet.ownerConsent ? "✓ " : ""}Allow this room to be discoverable</Text>
                </Pressable>
                {missingOwnerTitle ? <Text style={styles.error}>Add a room title before enabling owner discovery. Your private profile name is not used as a title.</Text> : null}
              </View> : null}
              <Text style={styles.detail}>Live notifications also follow the current audience and each recipient&apos;s preferences. This does not turn their notifications on.</Text>
            </> : null}
            {sheet?.confirm ? <View style={styles.confirm} testID="room-discovery-confirmation">
              <Text style={styles.heading}>Confirm audience change</Text>
              {sheet.ownerConsent ? <Text style={styles.detail}>I explicitly allow this current room&apos;s live card, room title and room display name to appear to the selected audience for this session only. This does not publish my owner profile or admin activity.</Text> : null}
              <Text style={styles.detail}>{sheet.draft && isWatchPartyDiscoveryEnabled(sheet.draft) && sheet.draft.discoveryVisibility === "public"
                ? "This can reveal your room title and host identity to eligible people outside your Circle and send allowed live notifications."
                : sheet.room?.discoveryVisibility === "circle" && sheet.draft?.discoveryVisibility !== "circle"
                  ? "Circle-only entry will no longer apply. Eligible people with the code may enter, even while discovery stays off. Room locks and content access still apply."
                  : "This may allow more eligible people to discover or enter the room. Existing content access rules remain in place."}</Text>
              <Pressable testID="room-discovery-cancel-confirmation" accessibilityRole="button" disabled={sheet.busy}
                onPress={() => { if (sheetCurrent(sheet) && !sheet.busy) { sheet.confirm = false; bump(); } }} style={styles.option}>
                <Text style={styles.label}>Keep editing</Text></Pressable>
            </View> : null}
            {pending && !sheet?.busy ? <Text style={styles.detail}>A previous save is still awaiting its server response. Reload after it finishes.</Text> : null}
            {sheet?.error ? <Text accessibilityRole="alert" style={styles.error} testID="room-discovery-error">{sheet.error}</Text> : null}
            {sheet?.message ? <Text accessibilityLiveRegion="polite" style={styles.detail} testID="room-discovery-result">{sheet.message}</Text> : null}
            <Pressable testID="room-discovery-save" accessibilityRole="button" accessibilityLabel={sheet?.confirm ? "Confirm and save room settings" : "Save room settings"}
              accessibilityState={{ disabled: disabled || !changed || missingOwnerTitle, busy: sheet?.busy ?? false }} disabled={disabled || !changed || missingOwnerTitle} onPress={() => { void save(); }}
              style={[styles.save, (disabled || !changed || missingOwnerTitle) && styles.disabled]}><Text style={styles.label}>{sheet?.busy ? "Saving…" : sheet?.confirm ? "Confirm & save" : "Save changes"}</Text></Pressable>
            <Pressable testID="room-discovery-reload" accessibilityRole="button" disabled={!!sheet?.busy || !!sheet?.reading || pending}
              onPress={() => { if (sheet) void read(sheet); }} style={styles.option}><Text style={styles.label}>Reload current settings</Text></Pressable>
            <Text style={styles.detail}>Back discards unsaved edits. A save already sent to the server may still finish.</Text>
          </ScrollView>
        </View>
      </ImageBackground>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  background: { flex: 1 }, scrim: { flex: 1, backgroundColor: "rgba(6,7,11,0.89)" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }, back: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 20, fontWeight: "800", flexShrink: 1 },
  content: { padding: 20, gap: 14, maxWidth: 620, width: "100%", alignSelf: "center" },
  entry: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.accentCrimson, backgroundColor: CHILLYWOOD_VISUAL.glassBackground },
  flex: { flex: 1 }, row: { flexDirection: "row", gap: 10 },
  heading: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 17, fontWeight: "800" },
  label: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 14, fontWeight: "700" },
  detail: { color: CHILLYWOOD_VISUAL.textMuted, fontSize: 13, lineHeight: 19 },
  option: { minHeight: 48, padding: 13, gap: 5, borderRadius: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, backgroundColor: CHILLYWOOD_VISUAL.controlBackground },
  selected: { borderColor: CHILLYWOOD_VISUAL.accentCrimson, backgroundColor: "rgba(123,26,53,0.42)" },
  confirm: { borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.accentCrimson, padding: 14, borderRadius: 12, gap: 10 },
  save: { minHeight: 50, padding: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#A81D42", borderRadius: 12 },
  error: { color: "#FFB8C8", fontSize: 14, lineHeight: 20 }, disabled: { opacity: 0.5 },
});
