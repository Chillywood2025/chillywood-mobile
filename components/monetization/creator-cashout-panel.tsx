import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Pressable, Text, TextInput, View } from "react-native";
import { getCurrentAccountSessionAuthoritySnapshot, subscribeToAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import { cancelQualifiedCreatorCashout, cashoutDollarsToMinor, CREATOR_CASHOUT_STATUS, previewQualifiedCreatorCashout, readCreatorCashoutHistory, submitQualifiedCreatorCashout, type CreatorCashoutQuote, type CreatorCashoutRecord } from "../../_lib/creatorCashoutExecution";
import { CHILLYWOOD_VISUAL } from "../ui/chillywood-visual-system";
import { captureAccountBoundSupabaseMutationSubject, type AccountBoundSupabaseMutationSubject } from "../../_lib/accountBoundSupabaseMutation";
import { acceptCreatorFeePolicy, loadCreatorFeePolicyStatus, type CreatorFeePolicyStatus } from "../../_lib/creatorFeePolicy";
const snapshotKey = () => { const snapshot = getCurrentAccountSessionAuthoritySnapshot(); return snapshot && !snapshot.restoreOnly ? JSON.stringify(snapshot) : ""; };
const money = (value: number | null) => value === null ? "Not yet verified" : `$${(value / 100).toFixed(2)}`;
export function CreatorCashoutPanel() {
  const key = useSyncExternalStore(subscribeToAccountSessionAuthority, snapshotKey, () => ""), focused = useIsFocused();
  const generation = useRef(0), latch = useRef(false), active = useRef(false), displayedQuote = useRef<CreatorCashoutQuote | null>(null);
  type Policy = {status:CreatorFeePolicyStatus;subject:AccountBoundSupabaseMutationSubject};
  const displayedPolicy=useRef<Policy | null>(null);
  const displayedRows=useRef<CreatorCashoutRecord[]>([]);
  const [amount,setAmount] = useState(""), [method,setMethod] = useState<"scheduled" | "instant">("scheduled");
  const [state,setState] = useState<{key:string; quote:CreatorCashoutQuote | null; policy:Policy | null; rows:CreatorCashoutRecord[]; notice:string; busy:boolean}>({key:"",quote:null,policy:null,rows:[],notice:"",busy:false});
  displayedQuote.current=state.key===key&&focused?state.quote:null;
  displayedPolicy.current=state.key===key&&focused?state.policy:null;
  displayedRows.current=state.key===key&&focused?state.rows:[];
  const retire=useCallback(()=>{active.current=false;displayedQuote.current=null;displayedPolicy.current=null;displayedRows.current=[];generation.current++;latch.current=false;},[]);
  useEffect(() => { generation.current++; active.current=!!key&&focused;latch.current=false;displayedQuote.current=null;displayedPolicy.current=null;setAmount("");setState({key,quote:null,policy:null,rows:[],notice:"",busy:false}); return retire; },[key,focused,retire]);
  const run = async (action: "quote" | "submit" | "history" | "policy" | "accept" | "cancel", row?:CreatorCashoutRecord) => {
    if (!key || !focused || !active.current || snapshotKey()!==key || latch.current) return;
    if(action==="submit"&&(!state.quote||displayedQuote.current!==state.quote))return;
    if(action==="accept"&&(!state.policy||displayedPolicy.current!==state.policy))return;
    if(action==="cancel"&&(!row||!displayedRows.current.includes(row)||row.canCancel!==true))return;
    const ticket=++generation.current; latch.current=true;
    const quote=state.key===key?state.quote:null;
    setState(previous=>({...previous,key,busy:true,notice:""}));
    const current=()=>active.current&&ticket===generation.current&&snapshotKey()===key;
    try {
      if(action==="cancel"&&row){
        const canceled=await cancelQualifiedCreatorCashout(row);
        if(current())setState(previous=>({...previous,key,busy:false,rows:previous.rows.map(old=>old.requestId===canceled.requestId?canceled:old),notice:canceled.status==="canceled"?"Canceled before funds were sent.":"Bank payout canceled. Funds remain held until the funding return and actual costs are verified; the app cashout fee will not be retained."}));
      }else if(action==="policy"){
        const subject=await captureAccountBoundSupabaseMutationSubject();
        const status=await loadCreatorFeePolicyStatus(subject);
        if(current())setState(previous=>({...previous,key,busy:false,policy:{subject,status},quote:null}));
      }else if(action==="accept"&&state.policy){
        const status=await acceptCreatorFeePolicy(state.policy.subject,state.policy.status);
        if(current())setState(previous=>({...previous,key,busy:false,policy:{subject:state.policy!.subject,status},quote:null,notice:"Your acceptance was recorded for these terms."}));
      }else if(action==="quote"){
        const result=await previewQualifiedCreatorCashout(cashoutDollarsToMinor(amount),method);
        if(current())setState(previous=>({...previous,key,busy:false,quote:result.ready?result:null,notice:result.ready?"Review these amounts before confirming.":"Cashout is not available yet. Payout settings and eligibility must be verified first."}));
      }else if(action==="submit"&&quote){
        const result=await submitQualifiedCreatorCashout(quote);
        if(current())setState(previous=>({...previous,key,busy:false,quote:null,rows:[result,...previous.rows.filter(row=>row.requestId!==result.requestId)],notice:"Request accepted. This does not mean the bank has received your money."}));
      }else if(action==="history"){
        const rows=await readCreatorCashoutHistory();if(current())setState(previous=>({...previous,key,busy:false,rows,notice:rows.length?"":"No cashout requests yet."}));
      }
    }catch(error){if(current())setState(previous=>({...previous,key,busy:false,notice:error instanceof Error?error.message:"Cashout status is unavailable."}));}
    finally{if(current()){latch.current=false;setState(previous=>({...previous,busy:false}));}}
  };
  if(!key||!focused)return null;
  const current=state.key===key?state:null, busy=current?.busy===true;
  const text={color:CHILLYWOOD_VISUAL.textMuted}, title={color:CHILLYWOOD_VISUAL.textPrimary};
  const change=()=>{displayedQuote.current=null;generation.current++;latch.current=false;setState(previous=>({...previous,key,quote:null,busy:false,notice:""}));};
  return <View testID="creator-cashout-execution" style={{padding:12,gap:10,borderRadius:12,backgroundColor:CHILLYWOOD_VISUAL.glassBackground,borderColor:CHILLYWOOD_VISUAL.glassBorder,borderWidth:1}}>
    <Text accessibilityRole="header" style={title}>Cashout requests</Text>
    <Text style={text}>Standard app fee: $0. Instant app fee: 2% of the amount requested, rounded up to the next cent. Provider costs are separate. Availability is checked on the server.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run("policy")}><Text style={{...title,paddingVertical:10}}>Review creator fee terms</Text></Pressable>
    {current?.policy?<View style={{gap:6}}>
      <Text style={text}>{current.policy.status.terms}</Text>
      <Text style={text}>Outstanding adjustment: {money(current.policy.status.negativeAdjustmentCents)}. This agreement never authorizes automatic bank debits.</Text>
      {current.policy.status.accepted?<Text style={text}>These fee terms are accepted.</Text>:<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run("accept")}><Text style={{...title,paddingVertical:10}}>I accept these creator fee terms</Text></Pressable>}
      {current.policy.status.adjustments.map(adjustment=><Text key={adjustment.id} style={text}>{adjustment.reason}: {money(adjustment.amountCents)} · {new Date(adjustment.createdAt).toLocaleDateString()}</Text>)}
    </View>:null}
    <TextInput accessibilityLabel="Cashout amount in dollars" keyboardType="decimal-pad" editable={!busy} value={amount} onChangeText={value=>{change();setAmount(value);}} placeholder="Amount in USD" placeholderTextColor={CHILLYWOOD_VISUAL.textMuted} style={{...title,padding:10,borderWidth:1,borderColor:CHILLYWOOD_VISUAL.glassBorder,borderRadius:8}} />
    <View style={{flexDirection:"row",gap:18}}>{(["scheduled","instant"] as const).map(value=><Pressable key={value} accessibilityRole="radio" accessibilityState={{checked:method===value,disabled:busy}} disabled={busy} onPress={()=>{change();setMethod(value);}}><Text style={title}>{method===value?"● ":"○ "}{value==="scheduled"?"Standard":"Instant"}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" disabled={busy||current?.policy?.status.accepted!==true||current.policy.status.negativeAdjustmentCents>0} onPress={()=>void run("quote")}><Text style={{...title,paddingVertical:10}}>Review cashout fees</Text></Pressable>
    {current?.quote?<View style={{gap:5}}>
      <Text style={text}>Requested: {money(current.quote.grossMinor)} · App fee: {money(current.quote.appFeeMinor)}</Text>
      <Text style={text}>Quoted provider cost: {money(current.quote.expectedProviderFeeMinor)} · Planned bank payout: {money(current.quote.bankMinor)}</Text>
      <Text style={text}>Provider cost is a qualified quote, not yet an observed charge. Under your accepted fee terms, later verified differences affect future unpaid earnings—not your bank account. Unverified costs stay under review.</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run("submit")}><Text style={{...title,paddingVertical:10}}>Confirm this cashout request</Text></Pressable>
    </View>:null}
    {current?.notice?<Text accessibilityLiveRegion="polite" style={text}>{current.notice}</Text>:null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run("history")}><Text style={{...title,paddingVertical:10}}>{busy?"Checking…":"Refresh cashout history"}</Text></Pressable>
    {current?.rows.map(row=><View key={row.requestId} style={{gap:4}}><Text style={title}>{CREATOR_CASHOUT_STATUS[row.status]??"Cashout status needs review"}</Text><Text style={text}>Requested {money(row.grossMinor)} · Planned bank amount {money(row.bankMinor)} · Verified known provider cost {money(row.observedProviderFeeMinor)}. Later verified adjustments may still arrive.</Text>{row.fundingReturnHeld?<Text style={text}>Your bank payout is canceled. Funds remain held while the platform verifies their return and actual costs. The app cashout fee will be returned.</Text>:null}{row.canCancel?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run("cancel",row)}><Text style={{...title,paddingVertical:10}}>{row.status==="funded"?"Cancel bank payout":"Cancel before funds are sent"}</Text></Pressable>:null}</View>)}
  </View>;
}
