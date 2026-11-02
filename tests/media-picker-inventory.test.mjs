import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const inventory = JSON.parse(fs.readFileSync('config/media-picker-inventory.json', 'utf8'));
const sources = new Map();
for (const root of ['app', 'components', 'hooks', '_lib']) {
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (/\.(ts|tsx)$/.test(name)) sources.set(name, fs.readFileSync(name, 'utf8'));
  } };
  walk(root);
}
const pickerNames = new Set(['pickDeviceImage', 'pickDeviceVideo', 'pickDeviceAttachments', 'pickSocialAttachmentFile', 'pickProfileMediaImage', 'pickMerchProductPhoto', 'chooseOfficialRachiProfileImageFromGallery']);
const nativeNames = new Set(Object.keys(inventory.nativeCalls));
const contains = (node, predicate) => { let found = false; const visit = n => { if (predicate(n)) found = true; else ts.forEachChild(n, visit); }; visit(node); return found; };
const property = (node, name) => ts.isObjectLiteralExpression(node) ? node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText().replace(/["']/g, '') === name) : undefined;
const ownerName = node => { for (let n = node.parent; n; n = n.parent) {
  if (ts.isFunctionDeclaration(n)) return n.name?.text;
  if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
    let parent = n.parent; if (ts.isCallExpression(parent)) parent = parent.parent;
    if (ts.isVariableDeclaration(parent)) return parent.name.getText();
  }
} return undefined; };

function inspect(input) {
  const errors = [], seen = new Map(), nativeCounts = {};
  const callerFiles = new Map(inventory.callers.map(entry => [entry.file, entry]));
  const wrapperFiles = new Set(inventory.wrappers.map(entry => entry.file));
  for (const [file, source] of input) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const aliases = new Set(), requests = [], localPickerNames = new Set(pickerNames), hookNames = new Set(['useMediaPicker']);
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings
        || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
      for (const binding of statement.importClause.namedBindings.elements) {
        const exported = binding.propertyName?.text ?? binding.name.text;
        if (pickerNames.has(exported)) localPickerNames.add(binding.name.text);
        if (exported === 'useMediaPicker') hookNames.add(binding.name.text);
      }
    }
    const error = message => errors.push(`${file}: ${message}`);
    const discover = node => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)
        && hookNames.has(node.initializer.expression.getText(ast))) {
        if (!callerFiles.has(file)) error('unregistered shared picker caller');
        if (ts.isObjectBindingPattern(node.name)) for (const element of node.name.elements) {
          if ((element.propertyName?.getText(ast) ?? element.name.getText(ast)) === 'pickMedia') aliases.add(element.name.getText(ast));
        }
      }
      ts.forEachChild(node, discover);
    }; discover(ast);
    const visit = node => {
      if (ts.isStringLiteral(node) && /^expo-(image|document)-picker$/.test(node.text) && file !== inventory.nativeAdapter) error('native SDK import outside the one registered adapter');
      if (ts.isCallExpression(node)) {
        const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(ast);
        if (nativeNames.has(name)) {
          if (file !== inventory.nativeAdapter) error(`direct native ${name}`);
          nativeCounts[name] = (nativeCounts[name] ?? 0) + 1;
        }
        if (aliases.has(name)) {
          const request = node.arguments[0], pick = request && property(request, 'pick');
          if (!pick) error('shared request missing an explicit picker callback');
          requests.push(ownerName(node));
        }
        if (localPickerNames.has(name) && !wrapperFiles.has(file) && file !== inventory.nativeAdapter) {
          let pick;
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (ts.isPropertyAssignment(parent) && parent.name.getText(ast) === 'pick') { pick = parent; break; }
          }
          const requestCall = pick?.parent?.parent;
          if (!pick || !ts.isCallExpression(requestCall) || !aliases.has(requestCall.expression.getText(ast))) error(`unowned helper call ${name}`);
          else {
            const callback = pick.initializer, token = (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.parameters[1]?.name.getText(ast);
            if (!token || !node.arguments.some(argument => contains(argument, n => ts.isIdentifier(n) && n.text === token))) error(`picker operation token not forwarded by ${name}`);
          }
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onPress' && node.initializer) {
        const handlers = new Set(callerFiles.get(file)?.requests ?? []);
        if (contains(node.initializer, n => ts.isCallExpression(n) && handlers.has(n.expression.getText(ast))
          && n.arguments.some(argument => ts.isStringLiteral(argument) && ['photos', 'gallery', 'camera', 'files'].includes(argument.text)))) error('separate source button bypasses shared sheet choice');
      }
      ts.forEachChild(node, visit);
    }; visit(ast);
    if (requests.length) seen.set(file, requests.sort());
  }
  for (const entry of inventory.callers) {
    if (JSON.stringify(seen.get(entry.file) ?? []) !== JSON.stringify([...entry.requests].sort())) errors.push(`${entry.file}: request inventory mismatch`);
  }
  if (JSON.stringify(Object.entries(nativeCounts).sort()) !== JSON.stringify(Object.entries(inventory.nativeCalls).sort())) errors.push('native SDK call inventory mismatch');
  return errors;
}

test('all production picker callsites are inventoried and use the explicit shared ownership path', () => {
  assert.deepEqual(inspect(sources), []);
  assert.equal(inventory.callers.length, 11);
  assert.ok(inventory.callers.every(entry => entry.reason && entry.surfaces.length));
  assert.ok(inventory.wrappers.every(entry => entry.reason));
  assert.match(inventory.boundaries.deviceOnlyPending.android, /does not expose EXTRA_LOCAL_ONLY/);
  assert.match(inventory.boundaries.deviceOnlyPending.android, /Gallery-app ACTION_PICK.*optional-native capability.*V18 hides it/);
  assert.match(inventory.boundaries.deviceOnlyPending.android, /not a device-only guarantee/);
  assert.match(inventory.boundaries.deviceOnlyPending.android, /qualification remain held/);
  assert.match(inventory.boundaries.deviceOnlyPending.ios, /installed iOS testing/);
  assert.match(inventory.boundaries.deviceOnlyPending.ios, /dismissal-completion patch.*implemented/);
});
test('inventory rejects new direct SDK imports, unowned helpers, source buttons and missing tokens', () => {
  const controls = [
    ['app/new-picker.tsx', 'import * as Picker from "expo-image-picker"; Picker.launchImageLibraryAsync({});'],
    ['app/new-picker.tsx', 'pickDeviceImage("photos");'],
    ['app/new-picker.tsx', 'import {pickDeviceImage as otherName} from "../_lib/deviceImagePicker"; otherName("photos");'],
    ['app/profile/[userId].tsx', sources.get('app/profile/[userId].tsx') + '\nconst Bad = () => <Button onPress={() => attachProfilePostFile("photos")} />;'],
    ['app/profile/[userId].tsx', sources.get('app/profile/[userId].tsx').replace('pickProfileMediaImage(kind, source, operation)', 'pickProfileMediaImage(kind, source)')],
    ['app/new-picker.tsx', 'const {pickMedia} = useMediaPicker("unregistered"); pickMedia({pick: pickDeviceImage});'],
  ];
  for (const [file, source] of controls) { const changed = new Map(sources); changed.set(file, source); assert.notEqual(inspect(changed).length, 0, file); }
});
