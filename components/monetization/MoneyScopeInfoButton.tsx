import React, { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

const DIGITAL_STORE_NAME = Platform.OS === "ios" ? "the App Store" : "Google Play";

export type MoneyScopeKey =
  | "premium"
  | "creator_tip"
  | "paid_creator_video"
  | "watch_party_ticket"
  | "live_watch_party_access_pass"
  | "live_watch_party_seat_pass"
  | "channel_subscription"
  | "vip_pass"
  | "event_pass"
  | "merch_physical_good"
  | "payout_readiness";

export type MoneyScopeInfo = {
  title: string;
  shortDescription: string;
  includes: string[];
  doesNotInclude: string[];
  whereItWorks: string;
  whoControlsIt: string;
  lifecycleNote: string;
  payoutNote: string;
};

export const MONEY_SCOPE_INFO: Record<MoneyScopeKey, MoneyScopeInfo> = {
  premium: {
    title: "Chi'llywood Premium",
    shortDescription: "App-wide Premium access for supported Chi'llywood features. It is not creator income.",
    includes: [
      "app-wide Premium access where your account is entitled",
      "creator tools where Premium is required",
      "Premium-gated app features",
    ],
    doesNotInclude: [
      "creator subscriptions",
      "VIP passes",
      "paid creator videos",
      "Watch-Party Seat Passes",
      "event passes",
      "tips",
      "payout access",
      "host, speaker, moderator, admin, or LiveKit publish authority",
    ],
    whereItWorks: "Across the app only where Chi'llywood Premium is the backed gate.",
    whoControlsIt: `Chi'llywood Premium is account-owned through ${DIGITAL_STORE_NAME} and RevenueCat entitlement checks.`,
    lifecycleNote: "Canceling stops future renewal and is not a refund. Chi'llywood has no standard Premium refund; paid-through access and any provider/store/legal reversal follow authoritative provider status.",
    payoutNote: "Premium never creates creator earnings, settlement holds, reserves, or payout access.",
  },
  creator_tip: {
    title: "Creator Tip",
    shortDescription: "Optional support for this creator. Tips unlock nothing.",
    includes: [
      "optional support for this creator",
      "optional note/message if supported",
    ],
    doesNotInclude: [
      "content unlocks",
      "VIP status",
      "subscription access",
      "paid videos",
      "Watch-Party Seat Pass access",
      "event access",
      "rankings, badges, or perks unless separately implemented",
      "payout access",
    ],
    whereItWorks: "Only as support for the selected creator Platform.",
    whoControlsIt: "The viewer chooses the tip amount where tips are available; creator setup controls whether tips appear.",
    lifecycleNote: "A tip is final and non-refundable through Chi'llywood and never changes viewer permissions. Authoritative fraud, duplicate, unauthorized, chargeback, provider, or legal reversals still reconcile.",
    payoutNote: "Creator earnings begin Pending, use a server-owned 7-day settlement hold, and remain subject to reserve and later reversal adjustments. Production payouts remain off.",
  },
  paid_creator_video: {
    title: "Paid Creator Video",
    shortDescription: "Unlocks playback for this specific creator video only.",
    includes: [
      "access to this one creator video",
      "playback access for this specific paid video while the grant is valid",
    ],
    doesNotInclude: [
      "other creator videos",
      "Chi'llywood Premium",
      "platform subscription",
      "VIP",
      "Watch-Party Seat Passes",
      "event passes",
      "LiveKit or room authority",
      "payout access",
    ],
    whereItWorks: "Only on the exact paid video tied to the purchase/access grant.",
    whoControlsIt: "The creator controls the video offer; safety, visibility, and access resolvers still apply.",
    lifecycleNote: "Before meaningful playback, failed delivery or platform fault may enter remedy review. After playback begins there is no standard refund, but authoritative reversals still reconcile and can revoke the direct grant.",
    payoutNote: "Direct-purchase earnings begin Pending and use a server-owned 7-day hold. Subscription-included playback creates no extra transaction or earnings.",
  },
  watch_party_ticket: {
    title: "Watch-Party Seat Pass",
    shortDescription: "Seat Pass access to one Watch-Party room target only.",
    includes: [
      "entry/access to this one Watch-Party room target while the Seat Pass is valid",
      "re-entry only if the grant is still valid and the room allows entry",
    ],
    doesNotInclude: [
      "host power",
      "speaker power",
      "camera/mic publish authority",
      "moderator/admin authority",
      "Chi'llywood Premium",
      "VIP",
      "subscription",
      "paid videos",
      "event passes",
      "other rooms",
      "payout access",
    ],
    whereItWorks: "Only on the linked Watch-Party target. It does not unlock Live Stage.",
    whoControlsIt: "Room entry still depends on the room, Seat Pass/access resolver, and route policy.",
    lifecycleNote: "Cancellation, unavailable-room, or creator/platform delivery failure may enter remedy review before meaningful entry. Successful use blocks a standard refund; authoritative reversals still reconcile.",
    payoutNote: "Earnings remain Pending through successful canonical room completion plus 48 hours. Advance purchases, canceled rooms, and reserved funds are not payout-ready.",
  },
  live_watch_party_access_pass: {
    title: "Live Watch-Party Access Pass",
    shortDescription: "Viewer/listener access to a linked Live Watch-Party / Live Stage target while valid.",
    includes: [
      "viewer/listener access to the linked Live Watch-Party / Live Stage target while valid",
    ],
    doesNotInclude: [
      "speaking seat",
      "automatic camera/mic publish access",
      "host power",
      "moderator/admin authority",
      "Watch-Party Seat Pass",
      "event access",
      "payout access",
    ],
    whereItWorks: "Only on the linked Live Watch-Party / Live Stage target.",
    whoControlsIt: "The live room, access resolver, host policy, and LiveKit token rules still control participation.",
    lifecycleNote: "This is access only. It does not make the viewer a speaker.",
    payoutNote: "Access pass rows remain sandbox/not-payable unless a separate live-money approval lane is completed.",
  },
  live_watch_party_seat_pass: {
    title: "Live Watch-Party Seat Pass",
    shortDescription: "Seat eligibility for a linked Live Watch-Party / Live Stage target.",
    includes: [
      "seat eligibility for the linked Live Watch-Party / Live Stage target",
    ],
    doesNotInclude: [
      "guaranteed speaker approval",
      "automatic camera/mic publish access",
      "host power",
      "moderator/admin authority",
      "general event access",
      "payout access",
    ],
    whereItWorks: "Only on the linked Live Watch-Party / Live Stage target where seat eligibility is supported.",
    whoControlsIt: "Host approval and LiveKit token rules still win.",
    lifecycleNote: "A seat pass only makes the viewer eligible where the app allows it.",
    payoutNote: "Seat pass rows remain sandbox/not-payable unless a separate live-money approval lane is completed.",
  },
  channel_subscription: {
    title: "Platform Subscription",
    shortDescription: "Creator-specific subscriber access. It is not Chi'llywood Premium.",
    includes: [
      "creator-specific subscriber area/access where enabled",
      "subscriber-only creator content or updates where actually available",
      "this creator's ordinary Paid Videos while the subscription is active",
    ],
    doesNotInclude: [
      "Chi'llywood Premium",
      "VIP pass",
      "VIP-only videos",
      "Watch-Party Seat Passes",
      "event passes",
      "other creators",
      "payout access",
      "room authority",
    ],
    whereItWorks: "Only on this creator Platform and subscriber surfaces backed by active access.",
    whoControlsIt: "The creator controls the subscription offer; effective access uses provider/access resolver state.",
    lifecycleNote: "Canceling stops future renewal and is not a prorated refund. Paid-through access continues unless authoritative provider state ends it; separately purchased videos keep their independent lifecycle.",
    payoutNote: "Each verified billing period uses its own server-owned 7-day settlement hold. Included Paid Video viewing creates no extra purchase, transaction, ledger event, or payout.",
  },
  vip_pass: {
    title: "VIP Pass",
    shortDescription: "A one-time, creator-specific VIP Pass valid for exactly 30 days.",
    includes: [
      "creator-specific VIP status/access where enabled",
      "VIP Area access where active",
      "this creator's VIP-only video shelf/content while active",
    ],
    doesNotInclude: [
      "Chi'llywood Premium",
      "platform subscription unless separately granted",
      "ordinary Paid Video ownership or subscription access",
      "Watch-Party Seat Passes",
      "event passes",
      "LiveKit, host, or speaker authority",
      "payout access",
      "other creators",
    ],
    whereItWorks: "Only on this creator Platform and VIP surfaces backed by active access.",
    whoControlsIt: "The creator controls the VIP offer; the access resolver controls whether VIP is active.",
    lifecycleNote: "The 30-day period starts at verified activation. There is no standard refund after valid access is delivered; failed delivery, early removal, or material misrepresentation may enter review, and authoritative reversal ends access.",
    payoutNote: "The 30-day access term is separate from the server-owned 7-day creator settlement hold and reserve. VIP never grants payout access.",
  },
  event_pass: {
    title: "Event Pass",
    shortDescription: "Access to this one creator event while valid.",
    includes: [
      "access to this one creator event while the event/pass is valid",
      "event entry/view access according to event state",
    ],
    doesNotInclude: [
      "VIP",
      "subscription",
      "paid videos",
      "Watch-Party Seat Passes",
      "Chi'llywood Premium",
      "other events",
      "LiveKit host/speaker authority",
      "payout access",
    ],
    whereItWorks: "Only on the linked creator event.",
    whoControlsIt: "The creator controls the event/pass; event state and access resolver decide entry.",
    lifecycleNote: "Cancellation, material unavailability/change, or delivery failure may enter remedy review before attendance. Successful attendance blocks a standard refund; authoritative reversals still reconcile.",
    payoutNote: "Earnings remain Pending through successful canonical event completion plus 48 hours. Advance purchases, canceled events, and reserved funds are not payout-ready.",
  },
  merch_physical_good: {
    title: "Physical Merch",
    shortDescription: "A physical product only. It does not unlock digital access.",
    includes: [
      "physical product checkout where the merch provider flow is available",
      "order/fulfillment handling only where backed",
    ],
    doesNotInclude: [
      "digital content unlocks",
      "Chi'llywood Premium",
      "VIP",
      "subscription",
      "Watch-Party Seat Passes",
      "event passes",
      "LiveKit authority",
      "host, speaker, moderator, or admin authority",
      "payout access",
    ],
    whereItWorks: "Only on the physical merch product/order flow.",
    whoControlsIt: "The creator/commerce setup controls the merch offer; provider, tax, shipping, and fulfillment rules still apply.",
    lifecycleNote: "Merch order status is separate from app access and digital entitlements.",
    payoutNote: "Merch does not create digital access or payout access. Live payouts remain off unless separately approved.",
  },
  payout_readiness: {
    title: "Payout Readiness",
    shortDescription: "Setup/status only. Pending or Reserved earnings are not Available and cannot be paid.",
    includes: [
      "provider setup/status checks where available",
      "KYC, tax, provider, and readiness labels where backed",
      "dry-run/read-only payout preview where enabled",
    ],
    doesNotInclude: [
      "cash-out",
      "withdrawal",
      "payable balance",
      "real payout",
      "provider transfer",
      "bank payout",
      "fake creator earnings",
      "Premium",
      "digital access",
    ],
    whereItWorks: "Only in creator/admin readiness surfaces. It does not execute money movement.",
    whoControlsIt: "Owner/provider/legal/accounting approval is required before any future production payout lane can execute.",
    lifecycleNote: "Pending clears only through server-owned settlement rules. Reserved remains unavailable until server release; provider reversals append adjustments and unresolved negative exposure blocks payout.",
    payoutNote: "Only Available money may be allocated. Pending, Reserved, Reversed, and negative-balance exposure cannot pay; production payouts remain off.",
  },
};

type MoneyScopeInfoButtonProps = {
  scope: MoneyScopeKey;
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const scopeTestIdByKey: Partial<Record<MoneyScopeKey, string>> = {
  event_pass: "money-scope-event-info",
  live_watch_party_access_pass: "money-scope-access-pass-info",
  live_watch_party_seat_pass: "money-scope-seat-pass-info",
  watch_party_ticket: "money-scope-ticket-info",
};

export function MoneyScopeInfoButton({
  scope,
  label = "What does this unlock?",
  compact = false,
  style,
  testID,
}: MoneyScopeInfoButtonProps) {
  const [visible, setVisible] = useState(false);
  const info = MONEY_SCOPE_INFO[scope];
  const resolvedTestID = testID ?? scopeTestIdByKey[scope] ?? "money-scope-info-button";
  const accessibilityLabel = useMemo(() => `${label} ${info.title}`, [info.title, label]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.button,
          compact ? styles.buttonCompact : null,
          pressed ? styles.buttonPressed : null,
          style,
        ]}
        testID={resolvedTestID}
      >
        <Text style={styles.iconText}>i</Text>
        {!compact ? <Text style={styles.buttonText}>{label}</Text> : null}
      </Pressable>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} />
          <View style={styles.sheet} testID="money-scope-info-sheet">
            <View style={styles.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <Text style={styles.kicker}>WHAT THIS INCLUDES</Text>
              <Text style={styles.title}>{info.title}</Text>
              <Text style={styles.body}>{info.shortDescription}</Text>
              <ScopeList title="Includes" items={info.includes} testID="money-scope-includes-list" />
              <ScopeList title="Does not include" items={info.doesNotInclude} testID="money-scope-does-not-include-list" muted />
              <ScopeDetail title="Where it works" body={info.whereItWorks} />
              <ScopeDetail title="Who controls it" body={info.whoControlsIt} />
              <ScopeDetail title="Expiration / refund / revoke" body={info.lifecycleNote} />
              <ScopeDetail title="Payout note" body={info.payoutNote} />
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close money scope information"
              onPress={() => setVisible(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ScopeList({ title, items, testID, muted = false }: { title: string; items: string[]; testID: string; muted?: boolean }) {
  return (
    <View style={[styles.listCard, muted ? styles.listCardMuted : null]} testID={testID}>
      <Text style={styles.listTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.listItem}>- {item}</Text>
      ))}
    </View>
  );
}

function ScopeDetail({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailTitle}>{title}</Text>
      <Text style={styles.detailBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#CFDAEA",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.22)",
    backgroundColor: "rgba(126,215,255,0.10)",
    paddingHorizontal: 12,
  },
  buttonCompact: {
    width: 30,
    height: 30,
    minWidth: 30,
    minHeight: 30,
    paddingHorizontal: 0,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonText: {
    color: "#D6F8FF",
    fontSize: 12,
    fontWeight: "900",
  },
  closeButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#DC143C",
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  detailBody: {
    color: "#B9C5D8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  detailCard: {
    gap: 4,
  },
  detailTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  handle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  iconText: {
    color: "#D6F8FF",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
  },
  kicker: {
    color: "#7ED7FF",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(126,215,255,0.08)",
    padding: 12,
    gap: 6,
  },
  listCardMuted: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  listItem: {
    color: "#C7D2E4",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  listTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(2,4,10,0.68)",
  },
  sheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#101722",
    padding: 18,
    paddingBottom: 24,
    gap: 14,
  },
  sheetContent: {
    gap: 12,
    paddingBottom: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
  },
});
