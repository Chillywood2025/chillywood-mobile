// _lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

import type { Database } from "../supabase/database.types";
import { getRuntimeConfig } from "./runtimeConfig";

const DEFAULT_SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const DEFAULT_SUPABASE_FUNCTIONS_URL = "https://network-proof.chillywoodstream.com";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJta2toaWhmYm1zbm5tY3Frb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjE1ODUsImV4cCI6MjA4NjczNzU4NX0.j45qJsnaZelO4fND2LGOwH66cb7qHr1LY0t31Ck-TcQ";
const runtimeConfig = getRuntimeConfig();

export const SUPABASE_URL = runtimeConfig.supabaseUrl || DEFAULT_SUPABASE_URL;
export const SUPABASE_FUNCTIONS_URL = runtimeConfig.supabaseFunctionsUrl || DEFAULT_SUPABASE_FUNCTIONS_URL;
export const SUPABASE_ANON_KEY = runtimeConfig.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY;

const isBrowser = typeof window !== "undefined";
const isWeb = Platform.OS === "web";

const webStorage = {
  getItem: (key: string) => Promise.resolve(isBrowser ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (isBrowser) window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (isBrowser) window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/g, "");
const SUPABASE_FUNCTIONS_ORIGIN = `${normalizeBaseUrl(SUPABASE_URL)}/functions/v1/`;
const TRUSTED_FUNCTIONS_ORIGIN = `${normalizeBaseUrl(SUPABASE_FUNCTIONS_URL)}/functions/v1/`;

const routeFunctionRequestUrl = (value: string) => (
  value.startsWith(SUPABASE_FUNCTIONS_ORIGIN)
    ? `${TRUSTED_FUNCTIONS_ORIGIN}${value.slice(SUPABASE_FUNCTIONS_ORIGIN.length)}`
    : value
);

const functionRoutingFetch: typeof fetch = (input, init) => {
  if (typeof input === "string" || input instanceof URL) {
    return fetch(routeFunctionRequestUrl(String(input)), init);
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    const rewrittenUrl = routeFunctionRequestUrl(input.url);
    return fetch(rewrittenUrl === input.url ? input : new Request(rewrittenUrl, input), init);
  }

  return fetch(input, init);
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: isWeb ? webStorage : AsyncStorage,
    storageKey: "@chillywood/supabase-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
  global: {
    fetch: functionRoutingFetch,
  },
});

export default supabase;
