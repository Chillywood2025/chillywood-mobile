import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority, subscribeToAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";
import { bindIsolatedTestStoreV3NativeCustomer, prepareIsolatedTestStoreV3NativePackage, purchaseIsolatedTestStoreV3NativePackage,
  readIsolatedTestStoreV3Build, retireIsolatedTestStoreV3NativeSession, closeIsolatedTestStoreV3NativePrepared, type TestStoreV3NativePrepared } from "./isolatedTestStoreV3Build";
import { sameTestStoreV3Customer, validTestStoreV3Allocation, validTestStoreV3Customer, type TestStoreV3Allocation, type TestStoreV3Customer, type TestStoreV3Result } from "./isolatedTestStoreV3Contract";

type Owner = { authority: Readonly<AccountSessionAuthorityBinding>; customer: TestStoreV3Customer; retired: boolean };
// This guard intentionally outlives individual screens and captures. Navigation
// must not hide an Auth gap from a configured SDK with pending cached work.
let processOwner: Owner | null = null;
const fail = (): never => { throw new Error("isolated_test_store_v3_native_authority_unavailable"); };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export async function captureIsolatedTestStoreV3Sdk(authority: AccountSessionAuthorityBinding, customer: TestStoreV3Customer) {
  const build = readIsolatedTestStoreV3Build(), saved = copy(customer), expected = Object.freeze({ ...authority });
  if (!build || !validTestStoreV3Customer(saved) || expected.restoreOnly || expected.userId !== expected.accountId || saved.buyerId !== expected.userId
    || saved.configurationDigest !== build.configId || saved.projectId !== build.projectId || saved.appId !== build.appId
    || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail();
  if (processOwner) {
    if (processOwner.retired || !sameAccountSessionAuthority(processOwner.authority, expected) || !sameTestStoreV3Customer(processOwner.customer, saved)) return fail();
  } else {
    const owner: Owner = { authority: expected, customer: saved, retired: false }; processOwner = owner;
    subscribeToAccountSessionAuthority(next => {
      if (!sameAccountSessionAuthority(owner.authority, next)) {
        owner.retired = true;
        // Failure never clears the JS veto. Native invocation completion still
        // retains its original identity and cannot become a new purchase ticket.
        void retireIsolatedTestStoreV3NativeSession(owner.authority.sessionGeneration).catch(() => {});
      }
    });
  }
  const owner = processOwner; let retired = false;
  const current = () => {
    if (retired || !owner || owner.retired || processOwner !== owner || !sameAccountSessionAuthority(expected, getCurrentAccountSessionAuthoritySnapshot())) return fail();
  };
  current(); await bindIsolatedTestStoreV3NativeCustomer(saved, expected.sessionGeneration); current();
  const prepared = new Map<string, { allocation: TestStoreV3Allocation; native: TestStoreV3NativePrepared; used: boolean }>();
  return Object.freeze({
    dispose() { retired = true; prepared.clear(); },
    async prepare(allocation: TestStoreV3Allocation) {
      current();
      if (!validTestStoreV3Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== saved.id
        || allocation.configurationDigest !== saved.configurationDigest || allocation.quote.creatorId === saved.buyerId
        || Date.parse(allocation.acceptPurchaseUntil) <= Date.now() || prepared.has(allocation.dispatchId)) return fail();
      const exact = copy(allocation);
      const native = await prepareIsolatedTestStoreV3NativePackage(saved, exact, expected.sessionGeneration); current();
      if (native.status === "package_unavailable") return null;
      prepared.set(exact.dispatchId, { allocation: exact, native, used: false });
      return copy(native.invocation);
    },
    async purchase(claim: TestStoreV3Result) {
      current();
      const allocation = claim.result.allocation;
      if (!allocation) return fail();
      const owned = prepared.get(allocation.dispatchId);
      if (!owned || owned.used || claim.actor.userId !== expected.userId || claim.actor.sessionId !== expected.sessionGeneration) return fail();
      owned.used = true;
      const result = await purchaseIsolatedTestStoreV3NativePackage(owned.native, saved, owned.allocation, claim);
      current(); return result;
    },
    async closePrepared(allocation: TestStoreV3Allocation) {
      current();
      if (!validTestStoreV3Allocation(allocation) || !allocation.registration || allocation.customerBindingId !== saved.id
        || allocation.configurationDigest !== saved.configurationDigest || allocation.quote.creatorId === saved.buyerId) return fail();
      const result = await closeIsolatedTestStoreV3NativePrepared(saved, copy(allocation), expected.sessionGeneration);
      prepared.delete(allocation.dispatchId); current(); return result;
    },
  });
}
export type IsolatedTestStoreV3Sdk = Awaited<ReturnType<typeof captureIsolatedTestStoreV3Sdk>>;
