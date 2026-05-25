export function generateSupabaseClient(): string {
  return `import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/db.js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
`;
}
