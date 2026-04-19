import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase admin client (service-role key).
 * Only call this from server-side code — never expose the service role key
 * to the browser.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Configuration Supabase Admin manquante sur le serveur.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
