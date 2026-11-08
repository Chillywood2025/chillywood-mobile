import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type IsolatedTipReceiptPresentation = {
  id: string; creatorId: string; amountMinor: number; currency: string; createdAt: string;
  status: "pending" | "verified" | "refunded" | "revoked" | "quarantined";
};
export function isolatedTipMoney(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() });
  return formatter.format(amountMinor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}
export function isolatedTipReceiptCopy(status: IsolatedTipReceiptPresentation["status"]) {
  return {
    pending: { title: "Test receipt pending", detail: "The provider result is not verified yet. Check status before considering another attempt." },
    verified: { title: "Test support received", detail: "A sandbox provider receipt is verified. This tip grants no content access and does not change Premium." },
    refunded: { title: "Test tip refunded", detail: "The provider has reported a full refund. This test receipt remains in your history." },
    revoked: { title: "Test receipt revoked", detail: "The provider has revoked this test receipt. It remains in your history." },
    quarantined: { title: "Test receipt under review", detail: "This receipt has conflicting, disputed or partial-refund information. Its payment result must be reconciled." },
  }[status];
}
/** Presentation only. Callers supply an owner-bound, validated server receipt;
 * SDK return values, local journal records and fixtures are not receipts. */
export function IsolatedTipReceipt({ receipt }: { receipt: IsolatedTipReceiptPresentation }) {
  const copy = isolatedTipReceiptCopy(receipt.status);
  return <View style={styles.card} testID={`isolated-tip-receipt-${receipt.id}`}>
    <Text style={styles.title}>{copy.title}</Text>
    <Text style={styles.money}>{isolatedTipMoney(receipt.amountMinor, receipt.currency)}</Text>
    <Text style={styles.body}>{copy.detail}</Text>
    <Text style={styles.body}>Test only · not payable · no payouts or cashout</Text>
    <Text style={styles.meta}>Creator: {receipt.creatorId}</Text>
    <Text style={styles.meta}>Recorded {new Date(receipt.createdAt).toLocaleString()}</Text>
    <Text selectable style={styles.meta}>Receipt reference: {receipt.id}</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { gap: 10, padding: 16, borderWidth: 1, borderColor: "#5C6170", borderRadius: 14, backgroundColor: "rgba(20,20,30,0.8)" },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" }, money: { color: "#fff", fontSize: 22, fontWeight: "800" },
  body: { color: "#D1D7E2", fontSize: 14, lineHeight: 21 }, meta: { color: "#B6C0D0", fontSize: 12, lineHeight: 18 },
});
