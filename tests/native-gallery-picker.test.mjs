import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { mediaPickerCompileTasks, resolveAndroidMediaPickerProjects, verifyMediaPickerRuntimeGraph, verifyGalleryNativeTestReport } from '../scripts/compile-native-camera-effects.mjs';
import { nativeSourceSnapshot } from '../scripts/ota-native-source-compatibility.mjs';

const root = 'modules/chillywood-gallery-picker';
const native = `${root}/android/src/main/java/expo/modules/chillywoodgallerypicker`;

test('actual Java gallery importer enforces bounded copy, type and retirement without Android SDK mocks', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'chillywood-gallery-java-'));
  try {
    const compile = spawnSync('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-d', out,
      ...['GalleryImportPolicy', 'GalleryImportControl', 'GalleryRequest', 'GalleryProcessCache'].map(name => `${native}/${name}.java`),
      ...['GalleryImportPolicyTest', 'GalleryLifecycleTest', 'GalleryProcessCacheTest'].map(name => `${root}/android/src/test/java/expo/modules/chillywoodgallerypicker/${name}.java`)], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
    for (const [name, count] of [['GalleryImportPolicyTest', 30], ['GalleryLifecycleTest', 37]]) {
      const run = spawnSync('java', ['-cp', out, `expo.modules.chillywoodgallerypicker.${name}`], { encoding: 'utf8', timeout: 15_000 });
      assert.equal(run.status, 0, run.stderr || run.error?.message); assert.match(run.stdout, new RegExp(`${count} JVM assertions passed`));
    }
    const cache = path.join(out, 'app-cache'); fs.mkdirSync(cache);
    for (const [phase, count] of [['first', 6], ['restart', 5]]) {
      const run = spawnSync('java', ['-cp', out, 'expo.modules.chillywoodgallerypicker.GalleryProcessCacheTest', cache, phase], { encoding: 'utf8', timeout: 15_000 });
      assert.equal(run.status, 0, run.stderr || run.error?.message); assert.match(run.stdout, new RegExp(`${count} JVM assertions passed`));
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

// These are source-boundary checks, NOT claims of Kotlin/Android compilation or
// installed intent behavior. Real platform compile and device tests are required.
test('native chooser is a package-agnostic ACTION_PICK and adds no broad library permission', () => {
  const source = fs.readFileSync(`${native}/GalleryContract.kt`, 'utf8');
  const manifest = fs.readFileSync(`${root}/android/src/main/AndroidManifest.xml`, 'utf8');
  assert.match(source, /Intent\(Intent\.ACTION_PICK\)\.setDataAndType\(collection, "\$kind\/\*"\)/);
  assert.match(source, /Intent\.createChooser/); assert.match(source, /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(source, /MediaStore\.Video\.Media\.EXTERNAL_CONTENT_URI/);
  assert.doesNotMatch(source, /setPackage\(|setComponent\(|com\.google\.android\.apps\.photos|com\.sec\./);
  assert.doesNotMatch(manifest, /uses-permission|QUERY_ALL_PACKAGES|READ_MEDIA|READ_EXTERNAL_STORAGE/);
  assert.equal((manifest.match(/android.intent.action.PICK/g) ?? []).length, 2);
  assert.match(source, /RESULT_CANCELED/); assert.match(source, /singleOrNull/); assert.match(source, /it\.scheme == "content"/);
});

test('recreated proxy retains exact process request; process-dead and retired owners cannot replay', () => {
  const source = fs.readFileSync(`${native}/ChillywoodGalleryPickerModule.kt`, 'utf8');
  const proxy = fs.readFileSync(`${native}/GalleryPickerActivity.kt`, 'utf8');
  const manifest = fs.readFileSync(`${root}/android/src/main/AndroidManifest.xml`, 'utf8');
  assert.doesNotMatch(source, /registerForActivityResult|RegisterActivityContracts/);
  assert.match(source, /OnActivityDestroys \{ lifecycleGeneration\.incrementAndGet\(\); activeRequest\.get\(\)\?\.cancel\(\) \}/);
  assert.match(source, /withContext\(NonCancellable\)/);
  assert.match(source, /finally \{[\s\S]*awaitCompletion\(GalleryActivityRegistry\.finish\(request, launchFailed\)\)[\s\S]*activeRequest\.compareAndSet\(request, null\)/);
  assert.match(proxy, /startActivityForResult/); assert.match(proxy, /savedInstanceState\?\.getBoolean\(LAUNCHED\)/);
  assert.match(proxy, /if \(!GalleryActivityRegistry\.attach\(id, this\)\) return/);
  assert.match(proxy, /if \(entry == null\) \{ finish\(\); return \}/);
  assert.match(manifest, /android:exported="false"/); assert.doesNotMatch(manifest, /noHistory/);
  assert.match(source, /ownedSelections\.remove\(selectionId\)\?\.delete\(\)/);
  assert.doesNotMatch(source, /requestPermissions|requestMediaLibrary|READ_MEDIA|setTimeout|postDelayed/);
  assert.match(source, /"localOnly" to false/);
});

test('module is Android-only, capability-optional, and requires a new native binary', () => {
  const config = JSON.parse(fs.readFileSync(`${root}/expo-module.config.json`, 'utf8'));
  assert.deepEqual(config.platforms, ['android']);
  const wrapper = fs.readFileSync(`${root}/index.js`, 'utf8');
  assert.match(wrapper, /requireOptionalNativeModule\("ChillywoodGalleryPicker"\)/);
});

test('required native SDK compiler includes real Gallery/core/ImagePicker variants and executes Activity lifecycle tests', () => {
  const tasks = mediaPickerCompileTasks();
  for (const name of ['chillywood-gallery-picker', 'expo-modules-core', 'expo-image-picker']) {
    for (const variant of ['Debug', 'Release']) for (const language of ['Kotlin', 'JavaWithJavac']) {
      assert(tasks.includes(`:${name}:compile${variant}${language}`));
    }
  }
  assert(tasks.includes(':chillywood-gallery-picker:testDebugUnitTest'));
  const xml = '<testsuite name="expo.modules.chillywoodgallerypicker.GalleryPickerActivityTest" tests="8" failures="0" errors="0" skipped="0">';
  assert.equal(verifyGalleryNativeTestReport(xml).tests, 8);
  for (const bad of [xml.replace('tests="8"', 'tests="0"'), xml.replace('skipped="0"', 'skipped="8"'), xml.replace('failures="0"', 'failures="1"'), '']) {
    assert.throws(() => verifyGalleryNativeTestReport(bad));
  }
});

test('hosted picker compilation rejects missing or prebuilt substitution and unsafe merged proxy', () => {
  const root = '/isolated';
  const modules = [
    ['chillywood-gallery-picker', 'modules', 'expo.modules.chillywoodgallerypicker.ChillywoodGalleryPickerModule'],
    ['expo-modules-core', 'node_modules', null], ['expo-image-picker', 'node_modules', 'expo.modules.imagepicker.ImagePickerModule'],
  ].map(([name, directory, module]) => ({ packageName: name, projects: [{ name, sourceDir: `${root}/${directory}/${name}/android`, modules: module ? [module] : [],
    ...(name === 'expo-image-picker' ? { publication: {} } : {}) }] }));
  const resolution = { modules, configuration: { buildFromSource: ['^expo-image-picker$'] } };
  assert.equal(resolveAndroidMediaPickerProjects(resolution, root).length, 3);
  assert.throws(() => resolveAndroidMediaPickerProjects({ ...resolution, configuration: {} }, root));
  for (let i = 0; i < modules.length; i++) assert.throws(() => resolveAndroidMediaPickerProjects({ ...resolution, modules: modules.filter((_, j) => i !== j) }, root));
  const graph = { components: modules.map(({ packageName }) => ({ kind: 'project', buildPath: ':', projectPath: `:${packageName}` })) };
  const manifest = '<activity android:name="expo.modules.chillywoodgallerypicker.GalleryPickerActivity" android:exported="false" />';
  verifyMediaPickerRuntimeGraph(graph, [manifest]);
  assert.throws(() => verifyMediaPickerRuntimeGraph({ components: [...graph.components, { group: 'host.exp.exponent', name: 'expo.modules.imagepicker' }] }, [manifest]));
  assert.throws(() => verifyMediaPickerRuntimeGraph(graph, [manifest.replace('false', 'true')]));
  assert.throws(() => verifyMediaPickerRuntimeGraph(graph, [manifest.replace('/>', 'android:noHistory="true" />')]));
});

test('existing native-source compatibility gate includes Gallery code and rejects old-binary equivalence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-native-digest-'));
  const git = (...args) => { const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const write = (name, value) => { const target = path.join(directory, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
  const commit = () => { git('add', '.'); git('-c', 'user.name=Native compatibility fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const snapshot = (sourceSha, platform) => nativeSourceSnapshot({ repositoryRoot: directory, sourceSha, platform });
  try {
    git('init', '-q');
    for (const name of ['package.json', 'package-lock.json', 'app.json', 'eas.json', 'config/release/production-ota-generation.json',
      'config/release/internal-native-generation.json', 'config/release/android-production.json', 'config/release/android-chat-livekit-qa.json']) write(name, '{}');
    for (const name of ['app.config.ts', '.easignore', 'plugins/withChillyChatNativeCallNotifications.js',
      'modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift']) write(name, '// fixture');
    const old = commit();
    write(`${root}/expo-module.config.json`, fs.readFileSync(`${root}/expo-module.config.json`));
    write(`${native}/GalleryPickerActivity.kt`, fs.readFileSync(`${native}/GalleryPickerActivity.kt`));
    const added = commit();
    assert.notEqual(snapshot(old, 'android').digest, snapshot(added, 'android').digest);
    assert(snapshot(added, 'android').input.files.some(file => file.path.endsWith('/GalleryPickerActivity.kt')));
    assert(!snapshot(added, 'ios').input.files.some(file => file.path.endsWith('/GalleryPickerActivity.kt')));
    write(`${native}/GalleryPickerActivity.kt`, '// different native source'); const changed = commit();
    assert.notEqual(snapshot(added, 'android').digest, snapshot(changed, 'android').digest);
    assert.equal(snapshot(added, 'ios').digest, snapshot(changed, 'ios').digest);
    // Shared module registration is conservatively an input on both platforms.
    assert.notEqual(snapshot(old, 'ios').digest, snapshot(added, 'ios').digest);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
