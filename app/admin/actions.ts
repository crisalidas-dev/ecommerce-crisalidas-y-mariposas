"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_PATH } from "@/lib/admin/sessionPolicy";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

/**
 * Cierra sesión en este dispositivo (`scope: "local"` — plan §3.3, sin
 * decidir todavía si algún flujo necesita cerrar sesión en todos lados).
 * También borra la cookie de sesión de la app.
 */
export async function signOut() {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut({ scope: "local" });
  (await cookies()).set(SESSION_COOKIE_NAME, "", { path: SESSION_COOKIE_PATH, maxAge: 0 });
  redirect("/admin/login");
}
