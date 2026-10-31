import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const panels = ['components/monetization/event-auction-panel.tsx', 'components/monetization/room-seat-auction-panel.tsx'];
const merch = ['merch-screens', 'merch-return-cases', 'merch-return-review', 'merch-shipping-details', 'merch-tracking-panel'].map(name => `components/merch/${name}.tsx`);

test('commerce panels and private order controls consume shared palette without opaque replacement backgrounds', () => {
  for (const path of [...panels, ...merch]) {
    const source = read(path);
    assert.match(source, /import \{ CHILLYWOOD_VISUAL \} from "\.\.\/ui\/chillywood-visual-system"/, path);
    assert.match(source, /CHILLYWOOD_VISUAL\.textPrimary/, path);
    assert.match(source, /CHILLYWOOD_VISUAL\.textMuted/, path);
    assert.doesNotMatch(source, /#0C1019|#84132D|#101116|#1D202A|#344367|#30303b|#596174/, path);
  }
  for (const path of panels) {
    const source = read(path);
    for (const token of ['glassBackground', 'glassBorder', 'controlBackground', 'controlBorder']) assert.ok(source.includes(`CHILLYWOOD_VISUAL.${token}`), `${path}: ${token}`);
  }
});

test('new sheet and every merchandise route reach canonical branded surface, including loading and account gates', () => {
  const sheet = read('components/monetization/room-seat-auction-entry.tsx');
  assert.match(sheet, /<ChillywoodBrandedSurface variant="app" testID="room-auction-branded-surface">/);
  assert.match(sheet, /<ScrollView style=\{\{ backgroundColor: "transparent" \}\}/);
  const shell = read('components/merch/merch-screens.tsx');
  assert.match(shell, /<ChillywoodBrandedSurface variant="app" testID="merch-branded-surface">/);
  assert.match(shell, /screen: \{ flex: 1, backgroundColor: "transparent" \}/);
  for (const [path, component] of [['app/merch/[creatorId].tsx', 'MerchShopScreen'], ['app/merch/orders.tsx', 'MerchOrdersScreen'], ['app/merch/studio.tsx', 'MerchStudioScreen']]) assert.ok(read(path).includes(component), path);
  assert.match(shell, /authorityStatus === "loading"\) return <Shell/);
  assert.match(shell, /authority\.restoreOnly\) return <Shell/);
});

test('embedded editors inherit auction palette while established host and tip backgrounds remain shared', () => {
  for (const name of ['event-auction-editor', 'event-auction-time-input', 'room-seat-auction-editor']) assert.match(read(`components/monetization/${name}.tsx`), /import \{ Action, styles \} from "\.\/(?:event-auction-panel|room-seat-auction-panel)"/);
  assert.match(read('components/monetization/tip-sheet.tsx'), /backgroundColor: CHILLYWOOD_VISUAL\.glassBackground/);
  assert.match(read('components/monetization/tip-sheet.tsx'), /<ChillywoodPrimaryActionFill/);
  assert.match(read('app/event/[eventId].tsx'), /safe: \{\s*flex: 1,\s*backgroundColor: "transparent"/);
  assert.match(read('app/_layout.tsx'), /<ChillywoodBrandedSurface style=\{styles\.appRootReady\} testID="app-root-ready" variant="app">/);
  for (const path of ['app/admin.tsx', 'app/channel-settings.tsx', 'app/watch-party/[partyId].tsx', 'app/watch-party/live-stage/[partyId].tsx', 'components/system/support-screen.tsx']) assert.match(read(path), /<ImageBackground/, path);
});
