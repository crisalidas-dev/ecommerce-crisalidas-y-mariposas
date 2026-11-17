import Link from "next/link";
import { SECONDARY } from "@/components/checkout/formStyles";

/** A short notice in the order page frame (rate limit, unreadable order). */
export function OrderMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex flex-1 flex-col px-4 pt-20 pb-16 sm:px-6 md:px-16 md:pt-28">
      <div className="mx-auto w-full max-w-xl">
        <h1 className="font-display text-2xl text-ink md:text-3xl">{title}</h1>
        <p className="mt-3 font-body text-sm text-ink">{body}</p>
        <div className="mt-6">
          <Link href="/" className={SECONDARY}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
