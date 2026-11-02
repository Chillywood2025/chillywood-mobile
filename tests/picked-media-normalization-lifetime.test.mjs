import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { loadStubbed } from './customer-experience-adversarial-helpers.mjs';

const root = process.env.STUDIO_SOURCE_ROOT || process.cwd();
const boundary = await import(pathToFileURL(path.join(root, '_lib/imageManipulatorNativeBoundary.mjs')));
const normalizationCode = ts.transpileModule(fs.readFileSync(path.join(root, '_lib/imageUploadNormalization.ts'), 'utf8'), {
  fileName: '_lib/imageUploadNormalization.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

function fixture(options = {}) {
  const resources = loadStubbed(path.join(root, '_lib/mediaPickerResources.ts'));
  const file = { uri: 'file:///native-gallery/opaque.heic', name: 'photo.heic', mimeType: 'image/heic' };
  const output = { uri: 'file:///native-manipulator/converted.jpg' };
  const render = deferred(), save = deferred(), rendered = deferred(), saving = deferred();
  const trace = [], discarded = [], sourceCleanup = [];
  if (!options.unowned) resources.ownPickedMedia(file, () => {
    sourceCleanup.push(file.uri);
    if (options.cleanupThrows) throw new Error('source cleanup failed');
    return Promise.resolve();
  });
  const runtime = { SaveFormat: { JPEG: 'jpeg' }, ImageManipulator: { manipulate(uri) {
    assert.equal(uri, file.uri); trace.push('manipulate');
    if (options.manipulateError) throw options.manipulateError;
    return {
      release() { trace.push('context-release'); if (options.cleanupThrows) throw new Error('context cleanup failed'); },
      renderAsync() {
        trace.push('render'); rendered.resolve();
        if (options.renderError) throw options.renderError;
        return render.promise;
      },
    };
  } } };
  const image = {
    release() { trace.push('image-release'); if (options.cleanupThrows) throw new Error('image cleanup failed'); },
    saveAsync() {
      trace.push('save'); saving.resolve();
      if (options.saveError) throw options.saveError;
      return save.promise;
    },
  };
  let timerId = 0;
  const timers = new Map();
  const imports = {
    './mediaPickerResources': resources, './imageManipulatorNativeBoundary.mjs': boundary,
    './imageUploadPolicy': loadStubbed(path.join(root, '_lib/imageUploadPolicy.ts')),
    './logger': { reportRuntimeError() {} }, 'expo': { requireOptionalNativeModule: () => ({}) },
    'expo-image-manipulator': runtime,
    'expo-file-system/legacy': {
      getInfoAsync: async () => ({ exists: true, size: 79 }),
      deleteAsync: async (uri, config) => {
        assert.equal(uri, output.uri, 'only exact native conversion output may be discarded by path');
        assert.equal(config.idempotent, true); discarded.push(uri);
      },
    },
  };
  const context = { exports: {}, Error,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`); return imports[name]; },
    setTimeout(callback, delay) { assert.equal(delay, 30000); const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(normalizationCode, context);
  return { file, output, image, trace, sourceCleanup, discarded, render, save,
    withRead: resources.withPickedMediaRead,
    rendered: rendered.promise, saving: saving.promise,
    run: () => context.exports.normalizeImageUploadFile(file),
    release: () => resources.releasePickedMedia(file),
    timeout() { assert.equal(timers.size, 1); [...timers.values()][0](); },
  };
}

for (const stage of ['render', 'save']) {
  for (const result of ['resolve', 'reject']) test(`normalization ${stage} timeout retains source and native handles until raw ${result}`, async () => {
    const f = fixture(), pending = f.run();
    const rejected = assert.rejects(pending, /could not be prepared/);
    await f.rendered;
    if (stage === 'save') { f.render.resolve(f.image); await f.saving; }
    f.timeout(); await rejected; await f.release(); await f.release();
    assert.deepEqual(f.sourceCleanup, []);
    assert.equal(f.trace.some(value => value.endsWith('-release')), false, 'native handles remain live while native reads');
    if (result === 'resolve') f[stage].resolve(stage === 'render' ? f.image : f.output);
    else f[stage].reject(new Error('late native rejection'));
    await settle();
    assert.deepEqual(f.sourceCleanup, [f.file.uri]);
    assert.equal(f.trace.filter(value => value === 'context-release').length, 1);
    assert.equal(f.trace.filter(value => value === 'image-release').length, stage === 'save' || result === 'resolve' ? 1 : 0);
    if (stage === 'render') assert.equal(f.trace.includes('save'), false, 'timed-out render cannot start a later save');
    assert.deepEqual(f.discarded, stage === 'save' && result === 'resolve' ? [f.output.uri] : []);
    await f.release(); assert.equal(f.sourceCleanup.length, 1);
  });
}

for (const failure of ['manipulateError', 'renderError', 'saveError']) test(`normalization synchronous ${failure} does not leak the selected source lease`, async () => {
  const f = fixture({ [failure]: new Error('native synchronous failure'), cleanupThrows: true }), pending = f.run();
  const rejected = assert.rejects(pending, /could not be prepared/);
  if (failure === 'saveError') { await f.rendered; f.render.resolve(f.image); }
  await rejected; await f.release(); await settle();
  assert.deepEqual(f.sourceCleanup, [f.file.uri]);
  assert.deepEqual(f.discarded, []);
});

test('normalization keeps a canceled source through render and save, then cleans only the generated output on explicit cleanup', async () => {
  const f = fixture(), pending = f.run();
  await f.rendered; await f.release();
  f.render.resolve(f.image); await f.saving;
  assert.deepEqual(f.sourceCleanup, [], 'the entire native pipeline has one continuous source lease');
  assert.equal(f.trace.some(value => value.endsWith('-release')), false);
  f.save.resolve(f.output); const normalized = await pending; await settle();
  assert.deepEqual(f.sourceCleanup, [f.file.uri]);
  assert.equal(normalized.file.uri, f.output.uri);
  assert.equal(normalized.file.mimeType, 'image/jpeg');
  assert.deepEqual(f.discarded, []);
  await normalized.cleanup(); await normalized.cleanup();
  assert.deepEqual(f.discarded, [f.output.uri]);
});

test('successful normalization does not release the original still-owned preview', async () => {
  const f = fixture(), pending = f.run();
  await f.rendered; f.render.resolve(f.image); await f.saving; f.save.resolve(f.output);
  const normalized = await pending;
  assert.deepEqual(f.sourceCleanup, []);
  await normalized.cleanup(); assert.deepEqual(f.sourceCleanup, []);
  await f.release(); assert.deepEqual(f.sourceCleanup, [f.file.uri]);
});

test('converted output cleanup waits for the actual raw upload reader, independently of original selection ownership', async () => {
  const f = fixture(), pending = f.run();
  await f.rendered; f.render.resolve(f.image); await f.saving; f.save.resolve(f.output);
  const normalized = await pending, upload = deferred();
  const reading = f.withRead(normalized.file.uri, () => upload.promise);
  const rejected = assert.rejects(reading, /raw upload failed after timeout/);
  await normalized.cleanup(); await normalized.cleanup(); await f.release();
  assert.deepEqual(f.sourceCleanup, [f.file.uri]);
  assert.deepEqual(f.discarded, [], 'normalization helper cleanup cannot race an upload of its generated JPEG');
  upload.reject(new Error('raw upload failed after timeout')); await rejected;
  assert.deepEqual(f.discarded, [f.output.uri]);
  await normalized.cleanup(); assert.equal(f.discarded.length, 1);
});

test('unowned input paths are never deleted by picked-media lifecycle', async () => {
  const f = fixture({ unowned: true }), pending = f.run();
  const rejected = assert.rejects(pending, /could not be prepared/);
  await f.rendered; f.timeout(); await rejected; await f.release();
  f.render.resolve(f.image); await settle();
  assert.deepEqual(f.sourceCleanup, []); assert.deepEqual(f.discarded, []);
});

test('native boundary preserves the original error even if both cleanup handles throw', async () => {
  const original = new Error('original native save failure');
  const releases = [];
  await assert.rejects(boundary.runImageManipulatorConversion({
    runtime: { ImageManipulator: { manipulate: () => ({
      renderAsync: async () => ({
        saveAsync: async () => { throw original; },
        release: () => { releases.push('image'); throw new Error('image release failed'); },
      }),
      release: () => { releases.push('context'); throw new Error('context release failed'); },
    }) } },
    sourceUri: 'file:///unowned.heic', compress: 0.92, format: 'jpeg', withTimeout: async promise => promise,
  }), error => error === original);
  await settle(); assert.deepEqual(releases, ['image', 'context']);
});
