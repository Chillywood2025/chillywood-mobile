import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  constants,
  createHash,
  generateKeyPairSync,
  privateEncrypt,
  sign,
  verify,
  webcrypto,
} from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { readTarGzip } from '../scripts/build-supabase-presence-backport.mjs';
import { build } from '../vendor/node-forge-safe/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'vendor/node-forge-safe');
const originalFiles = readTarGzip(readFileSync(path.join(vendor, 'upstream/node-forge-1.4.0.tgz')));
const patchedFiles = readTarGzip(readFileSync(path.join(vendor, 'chillywood-node-forge-safe-1.4.0-chillywood.1.tgz')));
const require = createRequire(import.meta.url);
const temporaryDirectories = [];
after(() => temporaryDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true })));

test('committed node-forge package rebuilds from exact verified upstream inputs', async () => {
  const { manifest } = await build();
  assert.equal(manifest.upstream.package, 'node-forge@1.4.0');
  assert.equal(manifest.output.package, '@chillywood/node-forge-safe@1.4.0-chillywood.1');
  assert.deepEqual(manifest.changes.map(change => change.file), [
    'dist/forge.all.min.js', 'dist/forge.all.min.js.map',
    'dist/forge.min.js', 'dist/forge.min.js.map', 'lib/rsa.js', 'package.json',
  ]);
});

function loadNodeForge(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'chillywood-forge-regression-'));
  temporaryDirectories.push(directory);
  // The bounded parser rejects traversal and symlinks. Only executable package
  // inputs are extracted; every fixture gets a separate CommonJS module cache.
  for (const [file, bytes] of files) {
    if (file !== 'package.json' && !file.startsWith('lib/')) continue;
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  return createRequire(path.join(directory, 'fixture.cjs'))('./lib/index.js');
}

function loadBrowserForge(files, file) {
  const browser = { crypto: webcrypto };
  const context = {
    window: browser,
    self: browser,
    module: { exports: {} },
    exports: {},
    setTimeout,
    clearTimeout,
    // forge.all's optional DOM entropy collectors initialize on load. These
    // inert handlers are the only UI seam; RSA and ASN.1 are the actual bundle.
    jQuery: () => ({ mousemove() {}, keypress() {} }),
  };
  runInNewContext(files.get(file).toString('utf8'), context, { filename: file, timeout: 5_000 });
  return context.module.exports;
}

const variants = [
  {
    label: 'CommonJS RSA implementation',
    file: 'lib/rsa.js',
    load: loadNodeForge,
    countGuard: /obj\.value\[0\]\.value\.length\s*!==\s*\(\('parameters' in capture\)\s*\?\s*2\s*:\s*1\)/g,
    nullGuard: /\('parameters' in capture && capture\.parameters !== ''\)/g,
  },
  ...['forge.min.js', 'forge.all.min.js'].map((name) => ({
    label: name,
    file: `dist/${name}`,
    load: (files) => loadBrowserForge(files, `dist/${name}`),
    countGuard: /[an]\.value\[0\]\.value\.length!==\("parameters"\s*in o\?2:1\)/g,
    nullGuard: /"parameters"\s*in o&&o\.parameters!==""/g,
  })),
];

// Ephemeral keys remain in this process and never reach disk, logs or providers.
// A private-key-generated malformed signature proves parser acceptance; it is
// deliberately not presented as a private-key-free low-exponent forgery.
const nativeKeys = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 65537 });
const publicKeyPem = nativeKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString();
const message = Buffer.from('Chi\u2019llywood isolated DigestInfo compatibility fixture');
const asn1Forge = loadNodeForge(originalFiles);
const asn1 = asn1Forge.asn1;
const universal = asn1.Class.UNIVERSAL;
const type = asn1.Type;
const octets = (value) => asn1.create(universal, type.OCTETSTRING, false, value);
const nullParameter = (value = '') => asn1.create(universal, type.NULL, false, value);
const malformedParameters = [
  ['nonempty primitive NULL', () => [nullParameter('unchecked interior bytes')]],
  ['wrong-tag optional parameter', () => [octets('unchecked interior bytes')]],
  ['constructed NULL', () => [asn1.create(universal, type.NULL, true, [octets('interior')])]],
  ['extra element after NULL', () => [nullParameter(), octets('interior')]],
  ['extra element before NULL', () => [octets('interior'), nullParameter()]],
  ['duplicate NULL', () => [nullParameter(), nullParameter()]],
];
const invalidDigestInfo = /ASN\.1 object does not contain a valid RSASSA-PKCS1-v1_5 DigestInfo value\./;

function fixture(parameters, algorithm = 'sha256', options = {}) {
  const digest = createHash(algorithm).update(message).digest().toString('binary');
  const oid = asn1.create(universal, type.OID, false, asn1.oidToDer(asn1Forge.oids[algorithm]).getBytes());
  const children = [asn1.create(universal, type.SEQUENCE, true, [oid, ...parameters]), octets(digest)];
  if (options.extraOuterElement) children.push(nullParameter());
  const digestInfo = asn1.toDer(asn1.create(universal, type.SEQUENCE, true, children)).getBytes();
  const signature = privateEncrypt(
    { key: nativeKeys.privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(digestInfo, 'binary'),
  ).toString('binary');
  return { digest, signature };
}

function verifyFixture(forge, input, scheme, options) {
  return forge.pki.publicKeyFromPem(publicKeyPem).verify(input.digest, input.signature, scheme, options);
}

function mutateGuard(variant, pattern) {
  const source = patchedFiles.get(variant.file).toString('utf8');
  assert.equal([...source.matchAll(pattern)].length, 1, `${variant.label}: mutation must remove exactly one intended guard`);
  const files = new Map(patchedFiles);
  files.set(variant.file, Buffer.from(source.replace(pattern, 'false')));
  return variant.load(files);
}

for (const variant of variants) {
  const original = variant.load(originalFiles);
  const patched = variant.load(patchedFiles);
  for (const [name, parameters] of malformedParameters) {
    test(`${variant.label}: rejects ${name} accepted by upstream 1.4.0`, () => {
      const input = fixture(parameters());
      for (const options of [undefined, { _parseAllDigestBytes: false }]) {
        assert.equal(verifyFixture(original, input, undefined, options), true, 'Original implementation must reproduce this exact malformed acceptance');
        assert.throws(() => verifyFixture(patched, input, undefined, options), invalidDigestInfo);
      }
    });
  }

  test(`${variant.label}: preserves absent and empty NULL SHA parameters`, () => {
    for (const algorithm of ['sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'sha512-224', 'sha512-256']) {
      for (const parameters of [[], [nullParameter()]]) {
        const input = fixture(parameters, algorithm);
        assert.equal(verifyFixture(patched, input), true, `${algorithm} parameter compatibility`);
      }
    }
  });

  test(`${variant.label}: preserves MD5 NULL requirement and outer element-count rejection`, () => {
    assert.equal(verifyFixture(patched, fixture([nullParameter()], 'md5')), true);
    assert.throws(() => verifyFixture(patched, fixture([], 'md5')), /Missing algorithm identifier NULL parameters/);
    assert.throws(() => verifyFixture(patched, fixture([nullParameter()], 'sha256', { extraOuterElement: true })), invalidDigestInfo);
  });

  test(`${variant.label}: nested-count mutation revives the intended malformed acceptance only`, () => {
    const mutant = mutateGuard(variant, variant.countGuard);
    assert.equal(verifyFixture(mutant, fixture([nullParameter(), octets('interior')])), true);
    assert.equal(verifyFixture(mutant, fixture([octets('wrong-tag parameter')])), true);
    assert.throws(() => verifyFixture(mutant, fixture([nullParameter('nonempty')])), invalidDigestInfo);
  });

  test(`${variant.label}: NULL-content mutation revives the intended malformed acceptance only`, () => {
    const mutant = mutateGuard(variant, variant.nullGuard);
    assert.equal(verifyFixture(mutant, fixture([nullParameter('nonempty')])), true);
    assert.throws(() => verifyFixture(mutant, fixture([nullParameter(), octets('extra')])), invalidDigestInfo);
  });

  test(`${variant.label}: retains native-generated signatures, digest mismatch, PSS and NONE`, () => {
    const digest = createHash('sha256').update(message).digest().toString('binary');
    const signature = sign('sha256', message, nativeKeys.privateKey).toString('binary');
    assert.equal(verifyFixture(patched, { digest, signature }), true);
    assert.equal(verifyFixture(patched, { digest: '\0'.repeat(32), signature }), false);
    const pssSignature = sign('sha256', message, {
      key: nativeKeys.privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    }).toString('binary');
    const pss = patched.pss.create({
      md: patched.md.sha256.create(),
      mgf: patched.mgf.mgf1.create(patched.md.sha256.create()),
      saltLength: 32,
    });
    assert.equal(verifyFixture(patched, { digest, signature: pssSignature }, pss), true);
    const rawSignature = privateEncrypt(
      { key: nativeKeys.privateKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(digest, 'binary'),
    ).toString('binary');
    assert.equal(verifyFixture(patched, { digest, signature: rawSignature }, 'NONE'), true);
  });
}

test('Installed Expo signing consumer resolves the reviewed private backport bytes', () => {
  const expoRequire = createRequire(require.resolve('@expo/code-signing-certificates'));
  assert.equal(expoRequire.resolve('node-forge'), require.resolve('node-forge'));
  const installedRoot = path.dirname(expoRequire.resolve('node-forge/package.json'));
  const metadata = JSON.parse(readFileSync(path.join(installedRoot, 'package.json'), 'utf8'));
  assert.equal(metadata.name, '@chillywood/node-forge-safe');
  assert.equal(metadata.version, '1.4.0-chillywood.1');
  for (const variant of variants) {
    assert.deepEqual(readFileSync(path.join(installedRoot, variant.file)), patchedFiles.get(variant.file));
  }
  const installed = expoRequire('node-forge');
  for (const [, parameters] of malformedParameters) {
    for (const options of [undefined, { _parseAllDigestBytes: false }]) {
      assert.throws(() => verifyFixture(installed, fixture(parameters()), undefined, options), invalidDigestInfo);
    }
  }
});

test('Installed Expo consumer completes certificate, CSR and signature verification roundtrips', () => {
  const expo = require('@expo/code-signing-certificates');
  const keyPair = expo.convertKeyPairPEMToKeyPair({
    publicKeyPEM: publicKeyPem,
    privateKeyPEM: nativeKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  });
  const now = Date.now();
  const certificate = expo.generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: new Date(now - 60_000),
    validityNotAfter: new Date(now + 86_400_000),
    commonName: 'Isolated local dependency regression',
  });
  const parsed = expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(certificate));
  assert.doesNotThrow(() => expo.validateSelfSignedCertificate(parsed, keyPair));
  const signature = Buffer.from(expo.signBufferRSASHA256AndVerify(keyPair.privateKey, parsed, message), 'base64');
  assert.equal(verify('sha256', message, nativeKeys.publicKey, signature), true);
  assert.equal(verify('sha256', Buffer.from('changed fixture'), nativeKeys.publicKey, signature), false);
  const csr = expo.generateCSR(keyPair, 'Isolated local CSR regression');
  assert.equal(expo.convertCSRPEMToCSR(expo.convertCSRToCSRPEM(csr)).verify(), true);
});
