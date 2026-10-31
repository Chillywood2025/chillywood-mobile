// Exact approved scope only. These reads never establish owner/legal approval.
export type ApprovedAuctionScope={platform_account_id:string;recipient_account_id:string;platform_product_id:string};
export async function observeApprovedAuctionQualification(scope:ApprovedAuctionScope,key:string,transport:typeof fetch=fetch){
 if(!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)||!/^acct_[A-Za-z0-9]+$/.test(scope.platform_account_id)
 ||!/^acct_[A-Za-z0-9]+$/.test(scope.recipient_account_id)||!/^prod_[A-Za-z0-9]+$/.test(scope.platform_product_id)
 ||scope.platform_account_id===scope.recipient_account_id)throw Error("approval_scope_invalid");
 const get=async(path:string)=>{
  const response=await transport(`https://api.stripe.com/v1${path}`,{method:"GET",redirect:"error",headers:{Authorization:`Bearer ${key}`,"Stripe-Version":"2026-10-28.endive"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error("qualification_unknown");return await response.json();
 };
 const platform=await get("/account"),recipient=await get(`/accounts/${scope.recipient_account_id}`),product=await get(`/products/${scope.platform_product_id}`);
 const requirements=recipient?.requirements;
 if(platform?.object!=="account"||platform.id!==scope.platform_account_id||recipient?.object!=="account"||recipient.id!==scope.recipient_account_id
 ||recipient.capabilities?.transfers!=="active"||recipient.details_submitted!==true||recipient.payouts_enabled!==true
 ||!requirements||requirements.disabled_reason!==null||!["currently_due","past_due","pending_verification"].every(k=>Array.isArray(requirements[k])&&requirements[k].length===0)
 ||product?.object!=="product"||product.id!==scope.platform_product_id||product.active!==true||product.livemode!==false)throw Error("qualification_unknown");
 return {...scope,environment:"test",provider_ready:true,complete:true,financial_authority:false};
}
