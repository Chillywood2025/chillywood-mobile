import { ChillywoodBrandedSurface } from "../ui/chillywood-branded-surface";
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { RoomSeatAuctionEditor } from "./room-seat-auction-editor";
import { Action, RoomSeatAuctionPanel } from "./room-seat-auction-panel";

/** Discovery/editor only. Opening this screen never purchases, joins or promotes. */
export function RoomSeatAuctionEntry({ partyId, creatorId, sourceKind }: {
  partyId: string; creatorId: string; sourceKind: "stage_reserved_seat" | "party_admission";
}) {
  const [open, setOpen] = useState(false);
  const [authority, setAuthority] = useState(getCurrentAccountSessionAuthoritySnapshot);
  useEffect(() => subscribeToAccountSessionAuthority(next => { setAuthority(next); setOpen(false); }), []);
  return <View>
    <Action label={sourceKind === "stage_reserved_seat" ? "Reserved guest spot auctions" : "Party admission auctions"} disabled={false} onPress={() => setOpen(true)} />
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
      {open ? <ChillywoodBrandedSurface variant="app" testID="room-auction-branded-surface"><ScrollView style={{ backgroundColor: "transparent" }} contentContainerStyle={{ padding: 16, gap: 12, paddingTop: 48, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Action label="Close room auctions" disabled={false} onPress={() => setOpen(false)} />
        <RoomSeatAuctionPanel key={`${partyId}:${authority?.sessionGeneration}`} partyId={partyId} />
        {authority?.userId === creatorId && !authority.restoreOnly ? <RoomSeatAuctionEditor key={`${partyId}:${authority.sessionGeneration}`} partyId={partyId} creatorId={creatorId} sourceKind={sourceKind} /> : null}
      </ScrollView></ChillywoodBrandedSurface> : null}
    </Modal>
  </View>;
}
