import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { bindIsolatedTestStoreV2NativeCustomer, prepareIsolatedTestStoreV2NativePackage, purchaseIsolatedTestStoreV2NativePackage,
  readIsolatedTestStoreV2Build, retireIsolatedTestStoreV2NativeSession, type TestStoreV2NativePrepared } from "./isolatedTestStoreV2Build";
import { sameTestStoreV2Customer, validTestStoreV2Allocation, validTestStoreV2Customer, type TestStoreV2Allocation, type TestStoreV2Customer, type TestStoreV2Result } from "./isolatedTestStoreV2Contract";

type Owner = { authority: Readonly<AccountSessionAuthorityBinding>; customer: TestStoreV2Customer; retired: boolean };
// This guard intentionally outlives individual screens and captures. Navigation
// must not hide an Auth gap from a configured SDK with pending cached work.
let processOwner: Owner | null = null;
const fail = (): never => { throw new Error("isolated_test_store_v2_native_authority_unavailable"); };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export async function captureIsolatedTestStoreV2Sdk(authority: AccountSessionAuthorityBinding, customer: TestStoreV2Customer) {
  const build = readIsolatedTestStoreV2Build(), saved = copy(customer), expected = Object.freeze({ ...authority });
  if (!build || !validTestStoreV2Customer(saved) || expected.restoreOnly || expected.userId !== expected.accountId || saved.buyerId !== expected.userId
    || saved.configurationDigest !== build.configId || saved.projectId !== build.projectId || saved.appId !== build.appId
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail();
  if (processOwner) {
    if (processOwner.retired || !sameAccountSessionAuthority(processOwner.authority, expected) || !sameTestStoreV2Customer(processOwner.customer, saved)) return fail();
  } else {
    const owner: Owner = { authority: expected, customer: saved, retired: false }; processOwner = owner;
    subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(owner.authority, next)) {
        owner.retired = true;
        // Failure never clears the JS veto. Native invocation completion still
        // retains its original identity and cannot become a new purchase ticket.
        void retireIsolatedTestStoreV2NativeSession(owner.authority.sessionGeneration).catch(() => {});
      }
    });
  }
  const owner = processOwner; let retired = false;
  const current = () => {
    if (retired || !owner || owner.retired || processOwner !== owner || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail();
  };
  current(); await bindIsolatedTestStoreV2NativeCustomer(saved, expected.sessionGeneration); current();
  const prepared = new Map<string, { allocation: TestStoreV2Allocation; native: TestStoreV2NativePrepared; used: boolean }>();
  return Object.freeze({
    dispose() { retired = true; prepared.clear(); },
    async prepare(allocation: TestStoreV2Allocation) {
      current();
      if (!validTestStoreV2Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== saved.id
        || allocation.configurationDigest !== saved.configurationDigest || allocation.quote.creatorId === saved.buyerId
        || Date.parse(allocation.acceptPurchaseUntil) <= Date.now() || prepared.has(allocation.dispatchId)) return fail();
      const exact = copy(allocation);
      const native = await prepareIsolatedTestStoreV2NativePackage(saved, exact, expected.sessionGeneration); current();
      if (native.status === "package_unavailable") return null;
      prepared.set(exact.dispatchId, { allocation: exact, native, used: false });
      return copy(native.invocation);
    },
    async purchase(claim: TestStoreV2Result) {
      current();
      const allocation = claim.result.allocation;
      if (!allocation) return fail();
      const owned = prepared.get(allocation.dispatchId);
      if (!owned || owned.used || claim.actor.userId !== expected.userId || claim.actor.sessionId !== expected.sessionGeneration) return fail();
      owned.used = true;
      const result = await purchaseIsolatedTestStoreV2NativePackage(owned.native, saved, owned.allocation, claim);
      current(); return result;
    },
  });
}
export type IsolatedTestStoreV2Sdk = Awaited<ReturnType<typeof captureIsolatedTestStoreV2Sdk>>;
