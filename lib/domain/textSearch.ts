/**
 * Type-to-search for admin pickers: case- and accent-insensitive substring
 * match on several fields (name, SKU...). No server dependencies.
 */

/** Lowercase without accents ("Crisálida" -> "crisalida"). */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Items where every word of the query appears in one of their fields, ranked:
 *   0  a field starts with the whole query ("matero" -> "Matero encanto")
 *   1  a word of a field starts with it ("matero" -> "Caja para matero")
 *   2  any other substring match
 * Ties keep the input order. An empty query returns nothing (the list only
 * appears while typing). At most `limit` results.
 */
export function searchByText<T>(items: T[], query: string, fields: (item: T) => string[], limit = 8): T[] {
  const q = foldText(query.trim()).replace(/\s+/g, " ");
  if (q === "") return [];
  const words = q.split(" ");

  const ranked: { item: T; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const values = fields(item).map(foldText);
    const haystack = values.join(" ");
    if (!words.every((w) => haystack.includes(w))) return;
    const rank = values.some((v) => v.startsWith(q))
      ? 0
      : values.some((v) => v.split(/[\s\-_/()]+/).some((part) => part.startsWith(q)))
        ? 1
        : 2;
    ranked.push({ item, rank, index });
  });

  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item);
}
