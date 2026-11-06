// Public Supabase settings. The publishable (or legacy anon) key is safe in the browser:
// Row Level Security decides what it can read and write.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
