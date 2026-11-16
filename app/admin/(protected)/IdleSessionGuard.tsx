"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
/** While the user is active, tell the server at most this often (must exceed the server refresh interval). */
const HEARTBEAT_MS = 4 * 60_000;
const LOGIN_EXPIRED = "/admin/login?expirada=1";

/**
 * Convenience only: sends the user to the login screen once they have been idle
 * for `idleMs`, and keeps the server idle timer alive while they work on a page
 * without navigating. The server (proxy + `requireAdminSession`) is the source
 * of truth. No animation.
 */
export function IdleSessionGuard({ idleMs }: { idleMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout>;
    let lastBeat = Date.now();

    const expire = () => router.replace(LOGIN_EXPIRED);

    const onActivity = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(expire, idleMs);
      if (Date.now() - lastBeat >= HEARTBEAT_MS) {
        lastBeat = Date.now();
        fetch("/admin/keepalive", { cache: "no-store" })
          .then((res) => {
            if (res.status === 401) expire();
          })
          .catch(() => undefined);
      }
    };

    onActivity();
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    return () => {
      clearTimeout(idleTimer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [idleMs, router]);

  return null;
}
