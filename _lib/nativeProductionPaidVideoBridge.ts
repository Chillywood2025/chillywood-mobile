import { requireOptionalNativeModule } from 'expo-modules-core';
import { AppState } from 'react-native';
import { sameAccountSessionAuthority, subscribeToAccountSessionAuthority,
  getCurrentAccountSessionAuthoritySnapshot } from './accountSessionAuthority';

export type NativeProductionWitness = {
  status: 'witness' | 'unknown' | 'cancelled'; dispatchId: string;
  witness?: string; keyId?: string; assertionBase64?: string; integrityToken?: string;
};
type NativeBridge = {
  available?: boolean;
  status(): Promise<{ protocol: string; available: boolean; configurationSha256?: string;
    applicationId?: string; nativeBuild?: string; sdkVersion?: string }>;
  invalidateOwner(): Promise<void>;
  enroll(challenge: string): Promise<{ keyId: string; attestationBase64: string }>;
  prepare(context: Record<string, string>, keyId: string, authorization: string): Promise<string>;
  purchase(handle: string): Promise<NativeProductionWitness>;
  authorizeEntry(handle: string): Promise<void>;
  recover(dispatchId: string, buyerId: string, sessionId: string): Promise<NativeProductionWitness>;
};
const native = requireOptionalNativeModule<NativeBridge>('ChillywoodProductionPaidVideo');
let captured = getCurrentAccountSessionAuthoritySnapshot();
subscribeToAccountSessionAuthority(next => {
  if (!sameAccountSessionAuthority(captured, next)) void native?.invalidateOwner().catch(() => {});
  captured = next;
});
AppState.addEventListener('change', state => {
  if (state !== 'active') void native?.invalidateOwner().catch(() => {});
});
export const isNativeProductionPaidVideoBuildAvailable = () => native?.available === true;
export function nativeProductionPaidVideoBridge(): NativeBridge {
  if (!native || native.available !== true) throw Error('Production Paid Video is not qualified on this build.');
  return native;
}
// Only the RevenueCat shared mutation owner imports this entry. There is no
// arbitrary payload-to-sign operation or caller-supplied completed transaction.
export function purchasePreparedNativeProductionVideo(handle: string) {
  return nativeProductionPaidVideoBridge().purchase(handle);
}
export function authorizePreparedNativeProductionVideo(handle: string) {
  return nativeProductionPaidVideoBridge().authorizeEntry(handle);
}
