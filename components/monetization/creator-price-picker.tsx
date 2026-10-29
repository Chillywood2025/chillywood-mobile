import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { CreatorSupportedPrice } from "../../_lib/creatorSupportedPrices";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

export type CreatorPricePickerProps = {
  prices: CreatorSupportedPrice[];
  selectedPriceKey: string | null;
  onSelect: (price: CreatorSupportedPrice) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onRetry?: () => void;
  testID?: string;
};

export function CreatorPricePicker({ prices, selectedPriceKey, onSelect, loading = false, error,
  disabled = false, onRetry, testID = "creator-price-picker" }: CreatorPricePickerProps) {
  return (
    <View testID={testID} style={styles.container}>
      <Text style={styles.title}>Choose your price</Text>
      <Text style={styles.body}>Only currently supported store prices can be selected. Existing purchases keep their agreed price.</Text>
      <Text style={styles.body}>Creator/platform split: 80/20. This is the buyer price; final earnings depend on verified provider settlement and fees.</Text>
      {loading ? <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color="#DC143C" /><Text style={styles.body}>Checking available prices…</Text>
      </View> : error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text>
        : prices.length === 0 ? <Text style={styles.body}>No supported price is available for this offer yet. Refresh before publishing paid access.</Text>
          : <View style={styles.options}>
            {prices.map(price => (
              <Pressable key={price.priceKey} testID={`${testID}-${price.priceKey}`}
                accessibilityRole="radio" accessibilityLabel={`${price.label}, ${price.availabilityLabel}${price.environment === "sandbox" ? ", sandbox test price" : ""}`}
                accessibilityState={{ checked: selectedPriceKey === price.priceKey, disabled }}
                disabled={disabled} onPress={() => onSelect(price)}
                style={[styles.option, selectedPriceKey === price.priceKey && styles.selected, disabled && styles.disabled]}>
                <Text style={styles.price}>{price.label}</Text>
                <Text style={styles.availability}>{price.availabilityLabel}</Text>
                {price.environment === "sandbox" ? <Text style={styles.hint}>Sandbox</Text> : null}
              </Pressable>
            ))}
          </View>}
      {!loading && onRetry ? <Pressable onPress={onRetry} disabled={disabled} accessibilityRole="button"
        accessibilityState={{ disabled }} accessibilityLabel="Refresh supported prices" style={styles.retry} testID={`${testID}-refresh`}>
        <Text style={styles.retryText}>Refresh prices</Text>
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 }, title: { color: "#fff", fontSize: 16, fontWeight: "800" },
  body: { color: "#C6CDDB", fontSize: 13, lineHeight: 19 }, error: { color: "#FF91A3", fontSize: 13, lineHeight: 19 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: { minHeight: 52, minWidth: 86, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)", borderRadius: 12, backgroundColor: CHILLYWOOD_VISUAL.glassBackground },
  selected: { borderColor: "#DC143C", backgroundColor: "rgba(220,20,60,0.18)" }, disabled: { opacity: 0.5 },
  price: { color: "#fff", fontSize: 16, fontWeight: "800" }, hint: { color: "#F2C25B", fontSize: 11, marginTop: 3 },
  availability: { color: "#C6CDDB", fontSize: 12, marginTop: 4, maxWidth: 190 },
  retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }, retryText: { color: "#E7EEFF", fontWeight: "700" },
});
