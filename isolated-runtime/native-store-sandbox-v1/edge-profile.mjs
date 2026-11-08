// Local source preparation only. No target, secrets, network or deploy action.
import { collectSourceBundle, importSpecifiers, sha256 } from '../../ops/creator-backend-rollout/prepare-edge.mjs';

export function nativeStoreCommandSourceProfile(readSource) {
  const name = 'native-store-sandbox-command-v1';
  const entrypoint = `supabase/functions/${name}/index.ts`;
  const bundle = collectSourceBundle(readSource, entrypoint);
  const files = bundle.files.map(({name, content}) => ({name, sha256: sha256(content)}));
  const externalImports = [...new Set(bundle.files.flatMap(({content}) => importSpecifiers(content).filter(value => /^(?:npm|jsr|https?|node):/u.test(value))))].sort();
  return {
    protocol: 'native-store-command-source-profile-v1', name, entrypoint_path: entrypoint, verify_jwt: true,
    files, sourceDigest: sha256(JSON.stringify(files)), externalImports,
    // Source closure is not a resolved SDK/runtime lock or hosted readback.
    runtimeQualified: false, hostedQualified: false, dispatchAllowed: false,
    bundle,
  };
}
