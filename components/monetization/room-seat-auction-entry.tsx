import { useLocalSearchParams, useRouter } from "expo-router";
import { readAuctionNavigation } from "../../_lib/auctionNavigation";
import { ChillywoodBrandedSurface } from "../ui/chillywood-branded-surface";
import React, { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { RoomSeatAuctionEditor } from "./room-seat-auction-editor";
import { Action, RoomSeatAuctionPanel } from "./room-seat-auction-panel";

/** Discovery/editor only. Opening this screen never purchases, joins or promotes. */
export function RoomSeatAuctionEntry({ partyId, creatorId, sourceKind }: {
  partyId: string; creatorId: string; sourceKind: "stage_reserved_seat" | "party_admission";
}) {
  const params = useLocalSearchParams();
  const router = useRouter();
  const hint = readAuctionNavigation(params, sourceKind);
  const consumed = useRef(new Set<string>());
  const initialAuthority = useRef(getCurrentAccountSessionAuthoritySnapshot());
  const [targetAuctionId, setTargetAuctionId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [authority, setAuthority] = useState(getCurrentAccountSessionAuthoritySnapshot);
  useEffect(() => subscribeToAccountSessionAuthority(next => { setAuthority(next); setOpen(false); setTargetAuctionId(null); }), []);
  useEffect(() => { setOpen(false); setTargetAuctionId(null); }, [partyId]);
  useEffect(() => {
    if (!hint || consumed.current.has(hint)) return;
    consumed.current.add(hint);
    router.setParams({ auctionId: undefined, auctionTarget: undefined, auctionExpiresAt: undefined });
    const current = getCurrentAccountSessionAuthoritySnapshot();
    if (!current || current.restoreOnly || current.userId !== initialAuthority.current?.userId
      || current.sessionGeneration !== initialAuthority.current?.sessionGeneration) return;
    setTargetAuctionId(hint); setOpen(true);
  }, [hint, router, partyId, sourceKind]);
  return <View>
    <Action label={sourceKind === "stage_reserved_seat" ? "Reserved guest spot auctions" : "Party admission auctions"} disabled={false} onPress={() => setOpen(true)} />
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
      {open ? <ChillywoodBrandedSurface variant="app" testID="room-auction-branded-surface"><ScrollView style={{ backgroundColor: "transparent" }} contentContainerStyle={{ padding: 16, gap: 12, paddingTop: 48, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Action label="Close room auctions" disabled={false} onPress={() => setOpen(false)} />
        <RoomSeatAuctionPanel key={`${partyId}:${authority?.sessionGeneration}`} partyId={partyId} targetAuctionId={targetAuctionId} targetSourceKind={sourceKind} />
        {authority?.userId === creatorId && !authority.restoreOnly ? <RoomSeatAuctionEditor key={`${partyId}:${authority.sessionGeneration}`} partyId={partyId} creatorId={creatorId} sourceKind={sourceKind} /> : null}
      </ScrollView></ChillywoodBrandedSurface> : null}
    </Modal>
  </View>;
}
