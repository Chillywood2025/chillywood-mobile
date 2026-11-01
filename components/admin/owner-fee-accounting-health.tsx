import React,{useCallback,useEffect,useRef,useState} from "react";
import {Pressable,Text,View} from "react-native";
import {readOwnerFeeAccountingHealth,type OwnerFeeAccountingHealth} from "../../_lib/ownerFeeAccountingHealth";
import {CHILLYWOOD_VISUAL} from "../ui/chillywood-visual-system";

// Mounted only by the exact current-session Owner panel. RPC independently
// checks Owner membership; account-bound reads retire on account/session change.
export function OwnerFeeAccountingHealthPanel({sessionKey}:{sessionKey:string}) {
 const [state,setState]=useState<{key:string;health:OwnerFeeAccountingHealth|null;error:boolean;busy:boolean}>({key:"",health:null,error:false,busy:false});
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const ticket=++generation.current;setState({key:sessionKey,health:null,error:false,busy:true});
  try{const health=await readOwnerFeeAccountingHealth();if(ticket===generation.current)setState({key:sessionKey,health,error:false,busy:false});}
  catch{if(ticket===generation.current)setState({key:sessionKey,health:null,error:true,busy:false});}
 },[sessionKey]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
 const current=state.key===sessionKey?state:null;
 const body={color:CHILLYWOOD_VISUAL.textMuted};
 return <View style={{gap:6}} testID="owner-fee-accounting-health">
  <Text accessibilityRole="header" style={{color:CHILLYWOOD_VISUAL.textPrimary}}>Fee accounting queue</Text>
  {!current||current.busy?<Text style={body}>Checking accounting…</Text>:null}
  {current?.error?<Text style={body}>Accounting status is unavailable. This does not mean the queue is clear.</Text>:null}
  {current?.health?<><Text style={body}>{current.health.pendingCount} pending · {current.health.retryCount} retrying · {current.health.blockedCount} need attention</Text>
   <Text style={body}>{current.health.fundingReturnHoldCount} canceled bank payouts awaiting funding return/accounting. Never manually resend these payouts.</Text>
   {current.health.fundingReturnHolds.slice(0,10).map(h=><Text selectable key={h.request_id} style={body}>{h.request_id} · {h.phase.replaceAll("_"," ")} · {h.required_action.replaceAll("_"," ")}</Text>)}
   {current.health.jobs.slice(0,10).map(j=><Text selectable key={`${j.source_type}:${j.source_id}`} style={body}>{j.source_type.replaceAll("_"," ")} · {j.source_id} · {j.state}: {(j.reason??"awaiting accounting check").replaceAll("_"," ")}</Text>)}</>:null}
  <Text style={body}>Read-only status. Missing acceptance, provider evidence, return clearance or disabled money controls keep releases blocked. No bank debit or payout is started here.</Text>
  <Pressable accessibilityRole="button" accessibilityLabel="Refresh fee accounting status" disabled={current?.busy===true} onPress={()=>void load()}><Text style={{color:CHILLYWOOD_VISUAL.textPrimary}}>Refresh accounting status</Text></Pressable>
 </View>;
}
