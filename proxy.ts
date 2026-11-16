import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  SESSION_EXPIRED_REDIRECT,
  encodeSession,
  evaluateSession,
  requireSessionSecret,
  sessionCookieOptions,
} from "@/lib/admin/sessionPolicy";

/**
 * `middleware.ts` está deprecado en Next.js 16, renombrado a `proxy.ts`
 * (mismo comportamiento, export `proxy` en vez de `middleware` — ver
 * node_modules/next/dist/docs/.../file-conventions/proxy.md).
 *
 * Capas: (1) sesión de Supabase Auth, (2) política de expiración propia
 * (inactividad 30 min / vida absoluta 12 h, `lib/admin/sessionPolicy.ts`).
 * El proxy no es la única barrera: layout y Server Actions vuelven a verificar
 * (`lib/admin/requireAdminSession.ts`).
 */
export async function proxy(request: NextRequest) {
  const { supabase, user, getResponse } = await updateSession(request);

  const isLoginPage = request.nextUrl.pathname === "/admin/login";

  if (!user) {
    if (isLoginPage) return withoutAppSession(getResponse(), request);
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const secret = requireSessionSecret();
  const evaluation = await evaluateSession({
    token: request.cookies.get(SESSION_COOKIE_NAME)?.value,
    secret,
    userId: user.id,
    now: Date.now(),
  });

  if (evaluation.status !== "ok") {
    // Cierra la sesión de Supabase (revoca y limpia cookies sb-*) y no deja
    // pasar. Si el usuario ya está en el login, se le deja ver el formulario
    // en lugar de redirigir en bucle.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    const target = isLoginPage ? getResponse() : NextResponse.redirect(new URL(SESSION_EXPIRED_REDIRECT, request.url));
    if (target !== getResponse()) {
      for (const cookie of getResponse().cookies.getAll()) target.cookies.set(cookie);
    }
    // Aunque signOut falle (red), el navegador no conserva los tokens.
    for (const { name } of request.cookies.getAll()) {
      if (name.startsWith("sb-")) target.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return withoutAppSession(target, request);
  }

  if (isLoginPage) return NextResponse.redirect(new URL("/admin", request.url));

  const response = getResponse();
  if (evaluation.refreshed) {
    response.cookies.set(
      SESSION_COOKIE_NAME,
      await encodeSession(evaluation.refreshed, secret),
      sessionCookieOptions(process.env.NODE_ENV === "production"),
    );
  }
  return response;
}

/** Borra la cookie de sesión de la app si el navegador la trae. */
function withoutAppSession(response: NextResponse, request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    response.cookies.set(SESSION_COOKIE_NAME, "", { path: SESSION_COOKIE_PATH, maxAge: 0 });
  }
  return response;
}

export const config = {
  // Cubre /admin y todo lo que cuelga de él (incluido /admin/login, que el
  // propio proxy deja pasar). Las rutas de la tienda quedan fuera a propósito.
  matcher: ["/admin/:path*"],
};
