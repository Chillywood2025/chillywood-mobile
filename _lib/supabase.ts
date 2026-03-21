// _lib/supabase.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const SUPABASE_URL = "https://bmkkhihfbmsnnmcqkoly.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJta2toaWhmYm1zbm5tY3Frb2x5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjE1ODUsImV4cCI6MjA4NjczNzU4NX0.j45qJsnaZelO4fND2LGOwH66cb7qHr1LY0t31Ck-TcQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    storageKey: "@chillywood/supabase-auth",
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
