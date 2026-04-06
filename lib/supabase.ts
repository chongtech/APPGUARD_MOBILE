import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

function createMissingSupabaseConfigError(target: string): Error {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");

  return new Error(
    `Supabase ${target} unavailable: missing ${missing.join(" and ")}. Configure Expo public env vars to use the real backend.`
  );
}

// Mock Supabase client for development without credentials
const mockSupabase = {
  auth: {
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: null, error: null }),
  },
  rpc: async (fn: string) => {
    throw createMissingSupabaseConfigError(`RPC "${fn}"`);
  },
  from: (_table: string) => ({
    select: () => ({ data: [], error: null }),
    insert: (_data: unknown) => ({ data: null, error: null }),
    update: (_data: unknown) => ({ data: null, error: null }),
    delete: () => ({ error: null }),
  }),
  channel: (_name: string) => ({
    on: (_event: string, _filter: unknown, _callback: unknown) => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
  removeChannel: (_channel: unknown) => {},
};

let supabase: ReturnType<typeof import("@supabase/supabase-js").createClient> | typeof mockSupabase;

try {
  if (supabaseUrl && supabaseAnonKey) {
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: false, // Guard app is kiosk-mode, no persistent auth sessions
        detectSessionInUrl: Platform.OS === "web",
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  } else {
    console.warn("⚠️  Supabase credentials not configured. Using mock client for development.");
    supabase = mockSupabase as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;
  }
} catch (error) {
  console.warn("⚠️  Could not initialize Supabase. Using mock client:", error);
  supabase = mockSupabase as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient>;
}

export { supabase };
