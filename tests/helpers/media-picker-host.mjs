// Production picker hook/coordinator/sheet with only RN presentation and account
// boundaries modeled. Native OS dismissal and device storage need physical QA.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');

export function loadMediaPickerHost({ React, native, host, snapshot, subscribe = () => () => {}, beforeHandoff }) {
  const same = (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId
    && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly && a.state === b.state;
  const account = { getCurrentAccountSessionAuthoritySnapshot: snapshot, sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: subscribe };
  const rn = { ...native, Platform: native.Platform ?? { OS: 'android' } };
  for (const name of ['Modal', 'Pressable', 'ScrollView', 'Text', 'View']) rn[name] ??= host?.(name) ?? (() => null);
  rn.StyleSheet ??= { create: value => value, absoluteFillObject: {} };
  const load = (file, modules) => {
    const context = { exports: {}, require: name => {
      if (!(name in modules)) throw Error(`Unmodeled media picker dependency: ${name}`);
      return modules[name];
    }, Promise, Symbol, Set, requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, context, { filename: file });
    return context.exports;
  };
  const resources = load('_lib/mediaPickerResources.ts', {});
  const ownership = load('hooks/useOwnedPickedMediaState.ts', { react: React, '../_lib/mediaPickerResources': resources });
  const coordinator = load('_lib/mediaPickerCoordinator.ts', { './mediaPickerResources': resources });
  const sheet = load('components/ui/MediaSourceSheet.tsx', { react: React, 'react-native': rn,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, './tokens': { color: {} },
    './icon-symbol': { IconSymbol: host?.('IconSymbol') ?? (() => null) },
    './chillywood-visual-system': { CHILLYWOOD_VISUAL: {} } });
  const hooks = load('hooks/useMediaPicker.tsx', { react: React, 'react-native': rn,
    '../_lib/accountSessionAuthority': account, '../_lib/mediaPickerCoordinator': coordinator,
    '../_lib/mediaPickerResources': resources,
    '../_lib/deviceGalleryPicker': { getDeviceGalleryCapability: async () => ({ available: false }) },
    '../components/ui/MediaSourceSheet': sheet });
  const useMediaPicker = beforeHandoff ? function useMediaPicker(key) {
    const picker = hooks.useMediaPicker(key);
    const invokePicker = picker.pickMedia;
    const pickMedia = React.useCallback(async request => {
      const result = await invokePicker(request);
      if (result) await beforeHandoff(result);
      return result;
    }, [invokePicker]);
    return {...picker, pickMedia};
  } : hooks.useMediaPicker;
  return { resources, ownedState: ownership, ...resources, ...ownership, ...hooks, useMediaPicker };
}
