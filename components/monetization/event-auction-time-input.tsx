import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { parseZonedEventScheduleInput, type EventTimeDisambiguation } from "../../_lib/eventSchedule";
import { Action, styles } from "./event-auction-panel";

export function EventAuctionTimeInput({ label, timeZone, disabled, onChange }: {
  label: string; timeZone: string; disabled: boolean; onChange: (iso: string | null) => void;
}) {
  const [parts, setParts] = useState({ month: "", day: "", year: "", hour: "", minute: "", period: "" });
  const [fold, setFold] = useState<EventTimeDisambiguation>("reject");
  const result = useMemo(() => {
    if (Object.values(parts).some(v => !v)) return { iso: null, error: "", ambiguous: false };
    if (!/^\d{4}$/.test(parts.year) || !/^\d{1,2}$/.test(parts.month) || !/^\d{1,2}$/.test(parts.day)
      || !/^\d{1,2}$/.test(parts.hour) || Number(parts.hour) < 1 || Number(parts.hour) > 12
      || !/^\d{1,2}$/.test(parts.minute) || Number(parts.minute) > 59) return { iso: null, error: "Enter a valid date and a time from 1:00 to 12:59.", ambiguous: false };
    const hour = Number(parts.hour) % 12 + (parts.period === "PM" ? 12 : 0);
    const wall = `${parts.year}-${parts.month.padStart(2,"0")}-${parts.day.padStart(2,"0")}T${String(hour).padStart(2,"0")}:${parts.minute.padStart(2,"0")}`;
    try { return { iso: parseZonedEventScheduleInput(wall, timeZone, fold, label), error: "", ambiguous: fold !== "reject" }; }
    catch (error) { const message = error instanceof Error ? error.message : "Check this date and time.";
      return { iso: null, error: message, ambiguous: message.includes("occurs twice") }; }
  }, [parts, timeZone, fold, label]);
  useEffect(() => { onChange(result.iso); }, [result.iso, onChange]);
  const update = (field: keyof typeof parts, value: string) => { setParts(p => ({ ...p, [field]: value })); setFold("reject"); };
  return <View style={styles.card}>
    <Text style={styles.title}>{label}</Text><Text style={styles.body}>Event time zone: {timeZone}</Text>
    {([ ["month", "Month (1–12)"], ["day", "Day"], ["year", "Year"], ["hour", "Hour (1–12)"], ["minute", "Minutes (00–59)"] ] as const).map(([field, title]) => <View key={field}>
      <Text style={styles.body}>{title}</Text><TextInput style={styles.input} accessibilityLabel={`${label} ${field}`} keyboardType="number-pad" maxLength={field === "year" ? 4 : 2} value={parts[field]} editable={!disabled} onChangeText={v => update(field, v)} />
    </View>)}
    <Text style={styles.body}>Choose AM or PM{parts.period ? ` · ${parts.period} selected` : ""}</Text>
    {(["AM", "PM"] as const).map(period => <Action key={period} label={`${label} ${period}`} disabled={disabled} onPress={() => update("period", period)} />)}
    {result.ambiguous ? <><Text style={styles.body}>The clocks go back at this time. Which occurrence do you mean?</Text><Action label={`${label} first occurrence (before clocks go back)`} disabled={disabled} onPress={() => setFold("earlier")} /><Action label={`${label} second occurrence (after clocks go back)`} disabled={disabled} onPress={() => setFold("later")} /></> : null}
    {result.error && !result.ambiguous ? <Text accessibilityLiveRegion="polite" style={styles.body}>{result.error}</Text> : null}
    {result.iso ? <Text style={styles.body}>{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long", timeZone }).format(new Date(result.iso))}{fold !== "reject" ? ` · ${fold === "earlier" ? "First" : "Second"} occurrence selected` : ""}</Text> : null}
  </View>;
}
