import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente administrativo: service_role, bypasa RLS. SOLO lo usa el webhook de
// WhatsApp (el bot es el único escritor de casos). Jamás importar desde código
// de cliente — el guard "server-only" rompe el build si ocurre.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
