import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de servidor con la sesión del usuario (anon key + cookies).
// Para páginas SSR y server actions: RLS decide qué ve cada quien.
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components no pueden escribir cookies; el middleware refresca.
          }
        },
      },
    }
  );
}
