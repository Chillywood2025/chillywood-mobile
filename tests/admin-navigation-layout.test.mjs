import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/admin.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('admin.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
for (const statement of parsed.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, declaration);
  }
}
const constant = name => {
  const declaration = declarations.get(name);
  assert.ok(declaration?.initializer, `missing production constant ${name}`);
  return vm.runInNewContext(`(${declaration.initializer.getText(parsed)})`);
};
const tabs = constant('operatorTabs');
const keys = constant('ADMIN_MAIN_TAB_KEYS');
const groups = constant('ADMIN_TAB_MAIN_GROUP');
const labels = { ...Object.fromEntries(tabs.map(tab => [tab.key, tab.label])), ...constant('ADMIN_MAIN_TAB_LABELS') };
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../_lib/adminNavigation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const build = (visible, selected = 'home') => exports.buildAdminNavigation(visible, keys, labels, groups, selected);

test('every registered permitted admin panel is reachable through its group and section', () => {
  for (const tab of tabs) {
    const nav = build(tabs, tab.key);
    assert.ok(nav.mainTabs.some(main => main.key === nav.activeMainKey), `orphan group: ${tab.key}`);
    assert.ok(nav.secondaryTabs.some(child => child.key === tab.key), `orphan section: ${tab.key}`);
  }
  assert.ok(tabs.some(tab => tab.key === 'owners'));
});

test('scoped child navigation never selects a denied parent or sibling panel', () => {
  for (const childKey of ['audit', 'dmca', 'roles', 'content', 'canary', 'permission-templates', 'owners']) {
    const visible = tabs.filter(tab => tab.key === 'home' || tab.key === childKey);
    const nav = build(visible, childKey);
    const group = nav.mainTabs.find(main => main.key === nav.activeMainKey);
    assert.equal(group.destination, childKey);
    assert.deepEqual(Array.from(nav.secondaryTabs, tab => tab.key), [childKey]);
    assert.ok(nav.mainTabs.every(main => visible.some(tab => tab.key === main.destination)));
  }
});

test('Moderator group selection and revocation leave only currently permitted destinations', () => {
  const visible = tabs.filter(tab => ['home', 'reports', 'audit'].includes(tab.key));
  const nav = build(visible, 'audit');
  assert.deepEqual(Array.from(nav.mainTabs, tab => tab.key), ['home', 'reports', 'system']);
  assert.equal(nav.mainTabs.find(tab => tab.key === 'system').destination, 'audit');
  const revoked = build(tabs.filter(tab => tab.key === 'home'), 'audit');
  assert.deepEqual(Array.from(revoked.mainTabs, tab => tab.destination), ['home']);
  assert.equal(revoked.secondaryTabs.length, 0);
  assert.equal(build([], 'home').mainTabs.length, 0);
});

test('safe-area content padding preserves usable width on narrow and landscape screens', () => {
  for (const width of [320, 375, 390, 768]) {
    for (const inset of [{ top: 0, bottom: 0, left: 0, right: 0 }, { top: 59, bottom: 34, left: 0, right: 0 }, { top: 0, bottom: 21, left: 44, right: 44 }]) {
      const style = exports.getAdminContentInsets(inset);
      assert.ok(style.paddingTop >= inset.top + 12);
      assert.ok(style.paddingBottom >= inset.bottom + 24);
      assert.ok(width - style.paddingLeft - style.paddingRight >= 196);
    }
  }
});

// These are source wiring guards in addition to the executed production model
// above. They are not native layout, screen-reader, keyboard or device proof.
test('navigation wiring retains accessible selected states and canonical visual primitives', () => {
  assert.match(source, /adminNavigation\.secondaryTabs\.map/);
  assert.match(source, /onPress=\{\(\) => setOperatorTab\(tab\.destination\)\}/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /accessibilityState=\{\{ selected: active \}\}/);
  assert.match(source, /getAdminContentInsets\(safeAreaInsets\)/);
  assert.match(source, /chillywood-branded-background\.png/);
  assert.match(source, /ChillywoodPrimaryActionFill radius=\{12\}/);
  assert.match(source, /tabButton: \{\s*minHeight: 44,/);
});

test('every confirmation dialog has bounded scrolling inside platform keyboard avoidance', () => {
  const confirmations = [];
  const visit = node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === 'KeyboardAvoidingView'
      && node.openingElement.attributes.getText(parsed).includes('styles.confirmBackdrop')) confirmations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(confirmations.length, 5, 'money, staff roles, content, owner security and creator moderation confirmations');
  for (const confirmation of confirmations) {
    const attributes = confirmation.openingElement.attributes.getText(parsed);
    assert.match(attributes, /Platform.OS === "ios" \? "padding" : "height"/);
    assert.match(attributes, /safeAreaInsets.top/);
    assert.match(attributes, /safeAreaInsets.bottom/);
    const scroll = confirmation.children.find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === 'ScrollView');
    assert.ok(scroll, 'confirmation must scroll before the keyboard obscures its actions');
    assert.match(scroll.openingElement.attributes.getText(parsed), /keyboardShouldPersistTaps="handled"/);
    assert.match(scroll.openingElement.attributes.getText(parsed), /accessibilityViewIsModal/);
    assert.match(scroll.getText(parsed), /onPress=/, 'action handlers remain inside the scrollable region');
  }
  const styles = declarations.get('styles').initializer.arguments[0];
  const styleObject = vm.runInNewContext(`(${styles.getText(parsed)})`, {
    StyleSheet: { absoluteFillObject: {} },
    CHILLYWOOD_VISUAL: { controlBorder: '', controlBackground: '', accentPurple: '', primaryBorder: '' },
  });
  assert.equal(styleObject.confirmScroller.maxHeight, '100%');
  assert.equal(styleObject.confirmScroller.flexGrow, 0);
  assert.equal(styleObject.confirmSheet.maxWidth, 420);
  assert.equal(styleObject.tabButton.minHeight, 44);
  assert.equal(styleObject.tabButton.height, undefined, 'large labels can grow vertically');
});
