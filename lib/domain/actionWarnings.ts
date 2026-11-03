/**
 * Warnings of a server action that succeeded but left something to finish by
 * hand (e.g. a photo or the chrysalis count could not be saved after the RPC).
 * Joined in order; null when there are none.
 */
export function combineWarnings(...warnings: (string | null | undefined)[]): string | null {
  const parts = warnings.map((w) => (w ?? "").trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}
