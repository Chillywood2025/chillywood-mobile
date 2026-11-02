import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Rendering inside a native Modal used to hide the feedback; placing it in a
// scrolling legal card or clipped video viewport would also hide it. Inspect
// the actual JSX host, not a duplicated screen fixture.
for (const [file, expression, ancestor] of [
  ['app/settings.tsx', 'mediaPickerSheet', 'ImageBackground'],
  ['app/profile/[userId].tsx', 'mediaPickerSheet', 'View'],
  ['app/chat/[threadId].tsx', 'mediaPickerSheet', 'KeyboardAvoidingView'],
  ['app/player/[id].tsx', 'commentMediaPickerSheet', 'SafeAreaView'],
  ['app/copyright-report.tsx', 'mediaPickerSheet', 'fragment'],
  ['app/counter-notice.tsx', 'mediaPickerSheet', 'fragment'],
]) test(`${file} puts shared pending feedback at a visible screen-level host`, () => {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression?.getText(ast) === expression) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.equal(found.length, 1);
  const parent = found[0].parent;
  assert.equal(ts.isJsxFragment(parent) ? 'fragment' : parent.openingElement?.tagName.getText(ast), ancestor);
  for (let node = parent; node; node = node.parent) {
    if (!ts.isJsxElement(node)) continue;
    assert.doesNotMatch(node.openingElement.getText(ast), /ScrollView|FlatList|<Modal\b|LegalPageShell|videoWrap/,
      'status must not be inside scroll/clipping/native presentation ancestors');
  }
});

test('Studio Clip keeps its existing choosing feedback and explicit upload controls', () => {
  const studio = fs.readFileSync('app/channel-settings.tsx', 'utf8');
  assert.match(studio, /Choosing video/); assert.match(studio, /Choosing cover/);
  assert.match(studio, /clip-studio-choose-full-video-button/);
});

test('Shop requests inline status where the shared host sits beside Attach inside its scrolling editor', () => {
  const shop = fs.readFileSync('components/merch/merch-screens.tsx', 'utf8');
  assert.match(shop, /preparingPlacement: "inline",\s*pick: pickMerchProductPhoto/);
  assert.match(shop, /<Button label="Choose product photo"[^\n]*\n\s*\{mediaPickerSheet\}/);
});
