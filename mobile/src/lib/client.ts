import { createApi } from "./api";
import { supabase } from "./supabase";

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) throw new Error("Missing EXPO_PUBLIC_API_URL. Copy .env.example to .env.");

/** App-wide API instance wired to the Supabase session. */
export const api = createApi({
  baseUrl,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  refreshToken: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
  onUnauthorized: () => void supabase.auth.signOut(),
});
