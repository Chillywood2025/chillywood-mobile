import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { readCreatorAuthoringPrices, type CreatorSupportedPrice } from "../../_lib/creatorSupportedPrices";
import { EventScheduleInputError, formatZonedEventScheduleInput, parseZonedEventScheduleInput } from "../../_lib/eventSchedule";
import { readNewCreatorEventReplayTermsError, type CreatorEventSummary } from "../../_lib/liveEvents";
import { configurePaidCreatorEventSale, type PaidCreatorEventOffer, type PaidCreatorEventOfferStatus } from "../../_lib/paidCreatorEvents";
import { CreatorPricePicker } from "./creator-price-picker";
import { EventAuctionEditor } from "./event-auction-editor";

export function EventSaleEditor({ event, offer, onSaved, onClose }: {
  event: CreatorEventSummary; offer: PaidCreatorEventOffer | null;
  onSaved: (offer: PaidCreatorEventOffer) => void; onClose: () => void;
}) {
  const [prices, setPrices] = useState<CreatorSupportedPrice[]>([]);
  const [selected, setSelected] = useState<CreatorSupportedPrice | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(offer?.capacityLimit == null ? "" : String(offer.capacityLimit));
  const [opens, setOpens] = useState(formatZonedEventScheduleInput(offer?.salesOpenAt ?? null, event.timeZone));
  const [closes, setCloses] = useState(formatZonedEventScheduleInput(offer?.salesCloseAt ?? null, event.timeZone));
  const [description, setDescription] = useState(offer?.description ?? "Access to this exact online Event.");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const flight = useRef(false);
  const generation = useRef(0);
  const environment = offer?.status === "active" ? "production" : "sandbox";
  const loadPrices = useCallback(async () => {
    const request = ++generation.current;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    setCatalogLoading(true); setCatalogError(null);
    const result = await readCreatorAuthoringPrices("event", { environment });
    if (!active.current || request !== generation.current || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return;
    setCatalogLoading(false);
    if (result.status !== "resolved" || result.subjectUserId !== event.hostUserId) {
      setPrices([]); setSelected(null); setCatalogError("Supported ticket prices could not be verified. Refresh before publishing."); return;
    }
    setPrices(result.prices);
    setSelected(current => result.prices.find(price => current ? price.priceKey === current.priceKey : !!offer && price.amountMinor === offer.priceCents && price.currency === offer.currency) ?? null);
  }, [environment, event.hostUserId, offer]);
  useEffect(() => { active.current = true; void loadPrices(); return () => { active.current = false; generation.current += 1; }; }, [loadPrices]);

  const save = async (status: PaidCreatorEventOfferStatus) => {
    if (flight.current || !selected || catalogLoading) return;
    const authority = getCurrentAccountSessionAuthoritySnapshot();
    const current = () => active.current && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
    if (!authority || authority.userId !== event.hostUserId) { setNotice("Sign in to the creator account before saving."); return; }
    flight.current = true; setBusy(true); setNotice("");
    try {
      if (!event.startsAt || !event.endsAt) throw new EventScheduleInputError("Save valid event start and end times before setting up tickets.");
      const replayError = readNewCreatorEventReplayTermsError(event);
      if (replayError) throw new EventScheduleInputError(replayError);
      const limit = capacity.trim() ? Number(capacity) : null;
      if (limit !== null && (!/^\d+$/.test(capacity.trim()) || !Number.isSafeInteger(limit) || limit < 1)) throw new EventScheduleInputError("Capacity must be a whole number of virtual tickets, or blank for no limit.");
      if (!description.trim()) throw new EventScheduleInputError("Describe what this ticket includes before saving.");
      const salesOpenAt = parseZonedEventScheduleInput(opens, event.timeZone, "reject", "Sales open");
      const salesCloseAt = parseZonedEventScheduleInput(closes, event.timeZone, "reject", "Sales close");
      if (!salesOpenAt || !salesCloseAt) throw new EventScheduleInputError("Choose both the sales opening and closing time before saving ticket terms.");
      if (salesOpenAt && salesCloseAt && Date.parse(salesCloseAt) <= Date.parse(salesOpenAt)) throw new EventScheduleInputError("Sales must close after they open.");
      if (Date.parse(salesCloseAt) > Date.parse(event.endsAt)) throw new EventScheduleInputError("Ticket sales must close no later than the event’s scheduled end.");
      const saved = await configurePaidCreatorEventSale({ creatorEventId: event.id, description: description.trim(),
        priceCents: selected.amountMinor, capacityLimit: limit, status, timeZone: event.timeZone, salesOpenAt, salesCloseAt,
        expectedUpdatedAt: event.updatedAt,
        expectedTerms: {title:event.eventTitle,startsAt:event.startsAt,endsAt:event.endsAt,replayPolicy:event.replayPolicy,
          replayAvailableAt:event.replayAvailableAt,replayExpiresAt:event.replayExpiresAt},
      });
      if (!current()) return;
      onSaved(saved);
      setNotice(status === "draft" ? "Ticket draft saved. Review the buyer preview before publishing."
        : status === "paused" ? "New ticket sales paused. Existing purchases keep their recorded terms."
          : "Ticket terms published. Buyers review this exact price, schedule, and included access before checkout.");
    } catch (error) {
      if (current()) setNotice(error instanceof EventScheduleInputError ? error.message : "Ticket settings could not be confirmed. Your edits are preserved; refresh before retrying.");
    } finally { flight.current = false; if (current()) setBusy(false); }
  };
  const disabled = busy || catalogLoading || !selected;
  return <View style={styles.panel} testID="event-sale-editor">
    <Text style={styles.title}>Tickets for {event.eventTitle}</Text>
    <Text style={styles.body}>Online admission only. These tickets do not assign a physical seat or grant speaking, camera, microphone, or host permission.</Text>
    <Text style={styles.body}>All times below use {event.timeZone}. {environment === "sandbox" ? "Sandbox setup is test-only and is not payable." : "Only verified supported prices are available."}</Text>
    <CreatorPricePicker prices={prices} selectedPriceKey={selected?.priceKey ?? null} onSelect={setSelected} loading={catalogLoading} error={catalogError} disabled={busy} onRetry={() => void loadPrices()} testID="event-price-picker" />
    <Text style={styles.label}>Virtual ticket capacity</Text>
    <TextInput style={styles.input} value={capacity} onChangeText={setCapacity} editable={!busy} keyboardType="number-pad" accessibilityLabel="Virtual event ticket capacity" placeholder="No limit" placeholderTextColor="#9AA5B8" />
    <Text style={styles.label}>Sales open / close</Text>
    <Text style={styles.body}>Choose both times using YYYY-MM-DDTHH:mm. Sales close by the event’s scheduled end. A repeated daylight-saving hour requires its explicit UTC offset.</Text>
    <TextInput style={styles.input} value={opens} onChangeText={setOpens} editable={!busy} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Event ticket sales open date and time" placeholder="Sales open" placeholderTextColor="#9AA5B8" />
    <TextInput style={styles.input} value={closes} onChangeText={setCloses} editable={!busy} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Event ticket sales close date and time" placeholder="Sales close" placeholderTextColor="#9AA5B8" />
    <Text style={styles.label}>Included access</Text>
    <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} editable={!busy} multiline accessibilityLabel="What this event ticket includes" />
    <Text style={styles.body}>Replay: {event.replayPolicy === "none" ? "Not included — live-only admission" : event.replayPolicy === "indefinite" ? "Historical terms without expiry; new ticket offers require an explicit replay window" : `Available from ${formatZonedEventScheduleInput(event.replayAvailableAt, event.timeZone) || "an availability time is saved"} until ${formatZonedEventScheduleInput(event.replayExpiresAt, event.timeZone) || "an expiry is saved"} (${event.timeZone})`}. Ticket terms record this event’s schedule and replay settings. Later edits do not rewrite a buyer’s recorded terms.</Text>
    <Text style={styles.body}>Cancellation makes affected buyers eligible for provider refund review immediately. A show that has not started within 30 minutes of its advertised start also qualifies. An earlier start, a delay of at least 30 minutes, or an event-local date change gives buyers notice and a choice to keep their ticket or request review. Accepting a new schedule keeps later cancellation and no-show protection. The payment provider determines any refund and its timing.</Text>
    <View style={styles.preview} testID="event-sale-buyer-preview">
      <Text style={styles.label}>Buyer preview</Text><Text style={styles.body}>{event.eventTitle} · {selected?.label ?? "Choose a supported price"} one-time</Text>
      <Text style={styles.body}>{formatZonedEventScheduleInput(event.startsAt, event.timeZone) || "Schedule required"} · {event.timeZone}</Text><Text style={styles.body}>{description}</Text>
      <Text style={styles.body}>{capacity.trim() ? `${capacity} virtual tickets` : "No virtual capacity limit"}</Text>
    </View>
    <EventAuctionEditor key={`${event.id}:${offer?.termsRevisionId ?? "none"}`} event={event} offer={offer} />
    {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}
    {busy ? <ActivityIndicator color="#DC143C" /> : null}
    <View style={styles.actions}>
      {([["draft", "Save ticket draft"], [environment === "production" ? "active" : "sandbox", "Publish ticket terms"]] as [PaidCreatorEventOfferStatus, string][]).filter(([status]) => status !== "draft" || !offer || offer.status === "draft").map(([status, label]) => <Pressable key={status} style={[styles.button, disabled && styles.disabled]} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy }} onPress={() => void save(status)}><Text style={styles.buttonText}>{label}</Text></Pressable>)}
      <Pressable style={styles.button} disabled={busy} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close event ticket settings"><Text style={styles.buttonText}>Close</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(220,20,60,0.6)", backgroundColor: "#0C1019" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" }, label: { color: "#fff", fontWeight: "800", fontSize: 14 },
  body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 }, input: { minHeight: 48, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#596174", color: "#fff" },
  multiline: { minHeight: 80, textAlignVertical: "top" }, notice: { color: "#F4BDCA", lineHeight: 20 }, preview: { gap: 6, padding: 12, backgroundColor: "#171E2C", borderRadius: 10 },
  actions: { gap: 8 }, button: { minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: "#84132D", justifyContent: "center" }, buttonText: { color: "#fff", fontWeight: "800" }, disabled: { opacity: 0.45 },
});
