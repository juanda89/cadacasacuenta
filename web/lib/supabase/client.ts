import { createBrowserClient } from "@supabase/ssr";

// Cliente de navegador: SOLO anon key. Ve exclusivamente las vistas públicas
// anonimizadas y, con sesión, lo que permita RLS.
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
