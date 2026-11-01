import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSession } from "../../_lib/session";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "../../_lib/accountSessionAuthority";
import { readPersonNotificationPreferences, savePersonNotificationPreferences, retryPersonNotificationPreferences, hasPendingPersonNotificationSave, PersonNotificationPreferenceError, type PersonNotificationChoices, type PersonNotificationPreferences } from "../../_lib/personNotificationPreferences";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";

type Props = { actorUserId: string; displayName: string };
export function PersonNotificationPreferencesButton(props: Props) {
  const { authority, authorityStatus } = useSession();
  if (!authority || authorityStatus !== "active" || authority.restoreOnly || authority.userId === props.actorUserId) return null;
  return <PersonChoices key={`${authority.userId}:${authority.accountId}:${authority.sessionGeneration}:${props.actorUserId}`}
    {...props} authority={authority} />;
}
function PersonChoices({ actorUserId, displayName, authority }: Props & { authority: AccountSessionAuthorityBinding }) {
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState<PersonNotificationPreferences | null>(null);
  const [draft, setDraft] = useState<PersonNotificationChoices | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mustReload, setMustReload] = useState(false);
  const generation = useRef(0), pending = useRef(false), mounted = useRef(false);
  useEffect(() => { const operationGeneration = generation; mounted.current = true; return () => { mounted.current = false; operationGeneration.current++; }; }, []);
  const current = (id: number) => mounted.current && generation.current === id
    && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot());
  const renderedGeneration = generation.current;
  const close = () => { if (!current(renderedGeneration)) return; generation.current++; pending.current = false; setVisible(false); setSaved(null); setDraft(null); setBusy(false); setMessage(null); };
  const load = async () => {
    if (pending.current || !sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())) return;
    pending.current = true; const id = ++generation.current;
    setVisible(true); setBusy(true); setSaved(null); setDraft(null); setMessage(null); setMustReload(false);
    try { const result = await readPersonNotificationPreferences(actorUserId, authority);
      if (current(id)) { setSaved(result); setDraft(result); }
    } catch { if (current(id)) setMessage("Could not load confirmed choices yet. If you saved earlier, its result may still be pending. Reload to check."); }
    finally { if (current(id)) { pending.current = false; setBusy(false); } }
  };
  const save = async () => {
    if (!visible || !current(renderedGeneration) || pending.current || !saved || !draft || mustReload) return;
    pending.current = true; const id = ++generation.current; setBusy(true); setMessage(null);
    try { const result = await savePersonNotificationPreferences(saved, draft, authority);
      if (current(id)) { setSaved(result); setDraft(result); setMessage("Notification choices saved."); }
    } catch (error) { if (current(id)) { setMustReload(true); setMessage(error instanceof PersonNotificationPreferenceError ? error.message : "Could not confirm your choices. Reload before saving again."); } }
    finally { if (current(id)) { pending.current = false; setBusy(false); } }
  };
  const retry = async () => {
    if (!visible || !current(renderedGeneration) || pending.current) return;
    pending.current = true; const id = ++generation.current; setBusy(true);
    try { const result = await retryPersonNotificationPreferences(actorUserId, authority);
      if (current(id)) { setSaved(result); setDraft(result); setMustReload(false); setMessage("Notification choices saved."); }
    } catch { if (current(id)) { setMustReload(true); setMessage("The earlier save is not confirmed. Reload to reconcile; no different choices were sent."); } }
    finally { if (current(id)) { pending.current = false; setBusy(false); } }
  };
  const select = (field: keyof PersonNotificationChoices, value: boolean | null) => {
    if (!visible || !current(renderedGeneration) || pending.current || mustReload) return;
    setDraft(old => old ? { ...old, [field]: value } : old); setMessage(null);
  };
  const name = displayName.trim() || "this person";
  return <>
    <Pressable testID="person-notifications-open" accessibilityRole="button" accessibilityLabel={`Notifications about ${name}`} onPress={() => void load()} style={styles.button}>
      <MaterialIcons name="notifications-none" size={20} color={CHILLYWOOD_VISUAL.textPrimary} /><Text style={styles.text}>Notifications</Text>
    </Pressable>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.root}><View style={styles.sheet} accessibilityViewIsModal>
        <ScrollView><Text style={styles.title}>Notifications about {name}</Text>
          <Text style={styles.copy}>Choose which updates you want. Your global notification settings and access rules still apply. This does not Follow or add anyone to Circle.</Text>
          <Text style={styles.copy}>Changes apply when you save. Closing does not cancel a save already sent.</Text>
          {busy ? <Text accessibilityRole="text" style={styles.copy}>{saved ? "Saving…" : "Loading…"}</Text> : null}
          {saved && draft ? <>
            {([ ["liveStarts", "Live starts"], ["watchPartyStarts", "Watch-Party starts"] ] as const).map(([field, label]) => <View key={field}>
              <Text style={styles.label}>{label}</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.options}>{([ [null, "Default"], [true, "On"], [false, "Off"] ] as const).map(([value, text]) =>
                <Pressable key={text} testID={`person-${field}-${text}`} accessibilityRole="radio" accessibilityState={{ checked: draft[field] === value, disabled: busy || mustReload }} disabled={busy || mustReload}
                  onPress={() => select(field, value)} style={[styles.option, draft[field] === value && styles.selected]}><Text style={styles.text}>{text}</Text></Pressable>)}</View>
            </View>)}
            <Text style={styles.copy}>Default uses your existing Follow/Circle choices. On still requires an eligible Follow or Circle relationship.</Text>
            <Text style={styles.copy}>{saved.circle ? "Current relationship: accepted Circle." : saved.following ? "Current relationship: Following." : "Not currently Following or in accepted Circle. Start updates are not eligible."}</Text>
            <Text style={styles.label}>Joined a live</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Joined a live" style={styles.options}>{([false, true] as const).map(value => <Pressable key={String(value)} testID={`person-joinedLive-${value ? "On" : "Off"}`}
              accessibilityRole="radio" accessibilityState={{ checked: draft.joinedLive === value, disabled: busy || mustReload }} disabled={busy || mustReload} onPress={() => select("joinedLive", value)}
              style={[styles.option, draft.joinedLive === value && styles.selected]}><Text style={styles.text}>{value ? "On" : "Off"}</Text></Pressable>)}</View>
            <Text style={styles.copy}>Off unless you choose On. Updates are eligible only for accepted Circle members, or when this person joins a room you host. Private room access still applies.</Text>
          </> : null}
          {message ? <Text testID="person-notifications-message" accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text> : null}
          {!busy && (!saved || mustReload) ? <Pressable testID="person-notifications-reload" accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text style={styles.text}>Reload choices</Text></Pressable> : null}
          {!busy && hasPendingPersonNotificationSave(actorUserId, authority) ? <Pressable testID="person-notifications-retry" accessibilityRole="button" onPress={() => void retry()} style={styles.button}><Text style={styles.text}>Retry the same save</Text></Pressable> : null}
          <View style={styles.options}>
            <Pressable testID="person-notifications-close" accessibilityRole="button" onPress={close} style={styles.button}><Text style={styles.text}>{busy ? "Close" : "Cancel / Close"}</Text></Pressable>
            {saved && draft ? <Pressable testID="person-notifications-save" accessibilityRole="button" accessibilityState={{ disabled: busy || mustReload }} disabled={busy || mustReload} onPress={() => void save()} style={styles.button}><Text style={styles.text}>Save choices</Text></Pressable> : null}
          </View>
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "90%", borderRadius: 22, padding: 20, backgroundColor: CHILLYWOOD_VISUAL.glassBackground, borderWidth: 1, borderColor: CHILLYWOOD_VISUAL.glassBorder },
  button: { minHeight: 44, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 14, backgroundColor: CHILLYWOOD_VISUAL.controlBackground },
  text: { color: CHILLYWOOD_VISUAL.textPrimary }, title: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 20, fontWeight: "700" },
  copy: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 14, lineHeight: 21, marginVertical: 10 },
  label: { color: CHILLYWOOD_VISUAL.textPrimary, fontSize: 16, fontWeight: "600", marginVertical: 8 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, option: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: "transparent", borderRadius: 12, backgroundColor: CHILLYWOOD_VISUAL.controlBackground },
  selected: { borderColor: CHILLYWOOD_VISUAL.glassBorder },
});
