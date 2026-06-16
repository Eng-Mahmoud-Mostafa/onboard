import { createClient } from "@supabase/supabase-js";

let supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for file uploads.");
    supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabase;
}

export function storageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "crm-files";
}
