import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { invokeAccountBoundSupabaseRpc } from "../../../_lib/accountBoundSupabaseRpc.mjs";

function loadSource(file, imports) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, setTimeout, clearTimeout,
    process: { env: {} },
    require: (name) => {
      if (!Object.hasOwn(imports, name)) throw new Error(`unexpected API dependency: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

// Real account publication/readback, mutation subject capture and frozen-JWT
// HTTP transport. Only the platform/bootstrap configuration is injected.
export async function loadAuthenticatedCommunicationApiSource(client, { apiUrl, anonKey }) {
  const bootstrap = { supabase: client, SUPABASE_URL: apiUrl, SUPABASE_ANON_KEY: anonKey };
  const deadlines = loadSource("_lib/entitlementAuthority.ts", {});
  const authority = loadSource("_lib/accountSessionAuthority.ts", {
    "./supabase": bootstrap, "./entitlementAuthority": deadlines,
  });
  const binding = await authority.readCurrentAccountSessionAuthority();
  if (!binding) throw new Error("local integration requires actual current account authority");
  authority.publishAccountSessionAuthoritySnapshot(binding);
  const mutation = loadSource("_lib/accountBoundSupabaseMutation.ts", {
    "./supabase": bootstrap,
    "./entitlementAuthority": deadlines,
    "./accountSessionAuthority": authority,
    "./accountBoundSupabaseRpc.mjs": { invokeAccountBoundSupabaseRpc },
    "react-native": { Platform: { OS: "ios" } },
  });
  return {
    api: loadCommunicationApiSource(client, mutation.runExactSessionAccountBoundSupabaseMutationRpc),
    authority,
  };
}

// Execute the actual application API against an injected real SDK connection.
// The account-bound transport adapter is supplied by the integration runner;
// unrelated platform/rendering imports are deliberately outside this boundary.
export function loadCommunicationApiSource(client, runExactSessionRpc) {
  const mocks = {
    "./accountBoundSupabaseMutation": { runExactSessionAccountBoundSupabaseMutationRpc: runExactSessionRpc },
    "./appConfig": {}, "./monetization": {},
    "./performancePolicy": { ROOM_ACTIVITY_ACTIVE_WINDOW_MS: 60_000, ROOM_HEARTBEAT_MS: 15_000 },
    "./roomRules": {
      ROOM_MEMBERSHIP_ACTIVE_WINDOW_MILLIS: 60_000,
      normalizeRoomMembershipState: (state) => state ?? "active",
      normalizeCapturePolicy: (value) => value ?? "no_recording",
      normalizeContentAccessRule: (value) => value ?? "participants_only",
    },
    "./supabase": { supabase: client }, "./userData": {}, "./watchParty": {},
    "expo-constants": { __esModule: true, default: { expoConfig: { extra: {} } } },
    "react-native": { Platform: { OS: "ios" } },
  };
  return loadSource("_lib/communication.ts", mocks);
}
