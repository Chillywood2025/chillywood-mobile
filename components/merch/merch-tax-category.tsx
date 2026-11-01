import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSession } from "../../_lib/session";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { listMerchTaxCategories, selectMerchTaxCategory, type MerchTaxCategories } from "../../_lib/creatorMerchTax";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

export function MerchTaxCategoryPicker({ productId, updatedAt, disabled = false, onSelected }: {
  productId: string; updatedAt: string; disabled?: boolean; onSelected: (updatedAt: string) => void;
}) {
  const session = useSession();
  const authority = session.authority;
  const [data, setData] = useState<MerchTaxCategories | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const generation = useRef(0), readSequence = useRef(0), latch = useRef(false);
  const current = () => !!authority && authority.state === "ACTIVE" && !authority.restoreOnly
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  const load = async (token: number) => {
    const read = ++readSequence.current;
    try { const result = await listMerchTaxCategories(productId); if (token === generation.current && read === readSequence.current && current()) setData(result); }
    catch { if (token === generation.current && read === readSequence.current && current()) setError("Categories could not be loaded. Refresh to try again."); }
  };
  useEffect(() => {
    const token = ++generation.current; setData(null); setError(null); setNote(""); setBusy(false); latch.current = false;
    if (current()) void load(token);
    return () => { generation.current = token + 1; };
    // A changed source revision or account invalidates all old callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, updatedAt, authority?.userId, authority?.sessionGeneration, authority?.state]);
  const choose = async (categoryId: string | null) => {
    if (disabled || latch.current || !current()) return;
    if (categoryId === null && !note.trim()) { setError("Describe what the product is made of and what the buyer receives."); return; }
    latch.current = true; readSequence.current++; setBusy(true); setError(null); const token = generation.current;
    try {
      const result = await selectMerchTaxCategory({ productId, categoryId, expectedUpdatedAt: updatedAt, note });
      if (token !== generation.current || !current()) return;
      setData(value => value ? { ...value, selection: result } : { categories: [], selection: result });
      onSelected(result.updatedAt);
    } catch (e) { if (token === generation.current && current()) setError(e instanceof Error ? e.message : "Category review could not be requested."); }
    finally { if (token === generation.current) { latch.current = false; setBusy(false); } }
  };
  const button = (label: string, action: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={action} style={styles.button}><Text style={styles.text}>{label}</Text></Pressable>;
  return <View style={styles.box} testID="merch-tax-category-picker">
    <Text accessibilityRole="header" style={styles.title}>Product category verification</Text>
    <Text style={styles.text}>Choose the approved category that accurately describes this item. This does not publish it or replace tax/provider verification. If none fits, request owner review—do not guess.</Text>
    {data?.selection ? <Text style={styles.text}>{data.selection.reason ?? (data.selection.status === "ready" ? "Category verified. Review live publishing separately." : "Category review or provider verification is still required.")}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
    {data?.categories.map(category => button(`Use category: ${category.label}`, () => void choose(category.id)))}
    {data && data.categories.length === 0 ? <Text style={styles.text}>No approved categories are available yet. Request review below.</Text> : null}
    <TextInput accessibilityLabel="Describe product for category review" placeholder="Materials, product type, and what the buyer receives" placeholderTextColor={CHILLYWOOD_VISUAL.textMuted} value={note} onChangeText={setNote} maxLength={500} multiline editable={!disabled && !busy} style={styles.input} />
    {button("Request review for an unlisted category", () => void choose(null))}
    {button("Refresh category verification", () => { setError(null); void load(generation.current); })}
  </View>;
}
const styles = StyleSheet.create({ box: { gap: 10, paddingVertical: 12 }, title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 17, fontWeight: "600" }, text: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 14 }, button: { padding: 12, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, borderRadius: 10 }, input: { color: CHILLYWOOD_VISUAL.textPrimary, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.controlBorder, padding: 12, borderRadius: 10 } });
