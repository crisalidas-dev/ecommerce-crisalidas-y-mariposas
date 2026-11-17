"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { SECONDARY } from "@/components/checkout/formStyles";
import { nextRefreshDelay } from "@/lib/domain/checkout/orderPage";

/**
 * Keeps an unfinished payment up to date: re-fetches the SERVER-rendered order
 * (`router.refresh()`) with a growing delay for a few minutes, and offers a
 * manual button. It never decides anything itself: when the database says the
 * order is paid, the server renders another panel and this leaf unmounts.
 * No animation, so nothing to gate on `prefers-reduced-motion`.
 */
export function OrderAutoRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    const startedAt = Date.now();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = nextRefreshDelay(Date.now() - startedAt, attempt);
      if (delay === null) return;
      timer = setTimeout(() => {
        attempt += 1;
        // A hidden tab keeps its place in the schedule but does not hit the server.
        if (!document.hidden) startTransition(() => router.refresh());
        schedule();
      }, delay);
    };
    schedule();

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <button
      type="button"
      className={SECONDARY}
      disabled={refreshing}
      aria-busy={refreshing}
      onClick={() => startTransition(() => router.refresh())}
    >
      {refreshing ? "Actualizando…" : "Actualizar"}
    </button>
  );
}
