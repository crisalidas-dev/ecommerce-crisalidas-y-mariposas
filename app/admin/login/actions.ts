"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { allowLoginAttempt, loginSucceeded } from "@/lib/admin/loginRateLimit";
import {
  SESSION_COOKIE_NAME,
  encodeSession,
  newSession,
  requireSessionSecret,
  sessionCookieOptions,
} from "@/lib/admin/sessionPolicy";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export type LoginState = { error: string | null };

/**
 * Sin registro propio (plan §3.2): las cuentas del panel se crean a mano en
 * el dashboard de Supabase Auth. Error genérico ante fallo, sin distinguir
 * "usuario no existe" de "contraseña incorrecta" (evita enumeración); el
 * mensaje de bloqueo por intentos tampoco revela si la cuenta existe.
 */
export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Ingresa correo y contraseña." };
  }

  // Falla cerrado antes de autenticar si falta el secreto de sesión.
  const secret = requireSessionSecret();

  if (!(await allowLoginAttempt(email))) {
    return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
  }

  const supabase = await createAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Correo o contraseña incorrectos." };
  }

  loginSucceeded(email);
  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    await encodeSession(newSession(data.user.id, Date.now()), secret),
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  redirect("/admin");
}
