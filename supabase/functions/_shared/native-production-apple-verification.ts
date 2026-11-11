import { Buffer } from 'node:buffer';
import { X509Certificate } from 'node:crypto';
import cbor from 'npm:cbor@10.0.11';
import { verifyAttestation, verifyAssertion } from 'npm:node-app-attest@1.0.1';
import { AppStoreServerAPIClient, Environment, SignedDataVerifier } from 'npm:@apple/app-store-server-library@3.1.0';
import { appleTransactionFacts, object, type StoreContext, type StoreFacts } from './native-production-store-verification.ts';

// Enrollment and assertion are deliberately separate. A key ID from JavaScript
// or a receipt signed by an arbitrary device key is not App Attest provenance.
export function verifyProductionAppleEnrollment(input: {
  attestationBase64: string; challenge: string; keyId: string; applicationId: string; teamId: string;
  nowMs: number;
}): { keyId: string; publicKey: string; counter: number } {
  const bytes = Buffer.from(input.attestationBase64, 'base64');
  if (bytes.length < 128 || bytes.length > 16384 || !/^[0-9a-f]{64}$/.test(input.challenge))
    throw Error('attestation_invalid');
  const decoded = cbor.decodeAllSync(bytes);
  if (decoded.length !== 1) throw Error('attestation_invalid');
  const chain = object(object(decoded[0]).attStmt).x5c;
  if (!Array.isArray(chain) || chain.length !== 2) throw Error('attestation_chain_invalid');
  // The pinned library validates Apple root/chain, nonce, public-key hash,
  // credential, RP ID, zero counter and production AAGUID. Check validity at
  // enrollment as well; leaf expiry does not expire subsequent assertions.
  for (const der of chain) {
    const certificate = new X509Certificate(der);
    if (Date.parse(certificate.validFrom) > input.nowMs || Date.parse(certificate.validTo) <= input.nowMs)
      throw Error('attestation_certificate_expired');
  }
  const result = verifyAttestation({ attestation: bytes, challenge: input.challenge, keyId: input.keyId,
    bundleIdentifier: input.applicationId, teamIdentifier: input.teamId, allowDevelopmentEnvironment: false });
  if (result.keyId !== input.keyId || typeof result.publicKey !== 'string') throw Error('attestation_invalid');
  return { keyId: result.keyId, publicKey: result.publicKey, counter: 0 };
}
export function verifyProductionAppleAssertion(input: {
  assertionBase64: string; witness: string; publicKey: string; previousCounter: number;
  applicationId: string; teamId: string;
}): number {
  const bytes = Buffer.from(input.assertionBase64, 'base64');
  if (bytes.length < 64 || bytes.length > 4096 || !Number.isSafeInteger(input.previousCounter)
    || input.previousCounter < 0 || input.previousCounter >= 4294967295) throw Error('assertion_invalid');
  const result = verifyAssertion({ assertion: bytes, payload: Buffer.from(input.witness, 'utf8'),
    publicKey: input.publicKey, bundleIdentifier: input.applicationId, teamIdentifier: input.teamId,
    signCount: input.previousCounter });
  if (!Number.isSafeInteger(result.signCount) || result.signCount <= input.previousCounter
    || result.signCount > 4294967295) throw Error('assertion_counter_invalid');
  // Caller must atomically compare-and-append this counter with witness receipt.
  return result.signCount;
}
export async function readProductionAppleTransaction(context: StoreContext, config: {
  signingKey: string; keyId: string; issuerId: string; rootCertificates: Uint8Array[];
}): Promise<StoreFacts> {
  if (context.provider !== 'app_store' || !Number.isSafeInteger(context.appleAppId)
    || !config.signingKey || !config.keyId || !config.issuerId || config.rootCertificates.length === 0)
    throw Error('apple_verifier_unqualified');
  const client = new AppStoreServerAPIClient(config.signingKey, config.keyId, config.issuerId,
    context.applicationId, Environment.PRODUCTION);
  const verifier = new SignedDataVerifier(config.rootCertificates.map(value => Buffer.from(value)), true,
    Environment.PRODUCTION, context.applicationId, context.appleAppId);
  const response = await client.getTransactionInfo(context.transactionId);
  if (!response.signedTransactionInfo) throw Error('apple_transaction_unavailable');
  const decoded = await verifier.verifyAndDecodeTransaction(response.signedTransactionInfo);
  return appleTransactionFacts(decoded, context);
}
