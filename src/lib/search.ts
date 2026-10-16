/**
 * Site search, the pure parts: what someone typed turned into words, a
 * safe LIKE pattern for each, and a short passage around the first match
 * to show under a result. Every word has to match somewhere (so more
 * words narrow it down); case doesn't matter.
 */

export const MAX_QUERY = 100;
export const MAX_WORDS = 6;

/** "  Linen   robe linen " → ["linen", "robe"]. Too long or too many is cut, never refused. */
export function searchWords(q: string): string[] {
  const words = q
    .slice(0, MAX_QUERY)
    .toLowerCase()
    .split(/\s+/)
    // Trim punctuation off the ends, keeping letters, numbers and the marks some scripts (Thai) build words with.
    .map((w) => w.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, ""))
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_WORDS);
}

/** A word as a LIKE pattern that matches it anywhere, with LIKE's own wildcards taken literally. */
export function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** About `width` characters of `text` around the first word found, with … where it's cut. Empty when none is. */
export function snippet(text: string, words: string[], width = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return "";
  // A match near the end still gets a full-width passage, reaching further back.
  const start = Math.max(0, Math.min(at - Math.floor(width / 3), flat.length - width));
  const end = Math.min(flat.length, start + width);
  // Start and stop on a space, so no word is cut in half.
  const from = start === 0 ? 0 : flat.indexOf(" ", start) + 1 || start;
  const to = end === flat.length ? end : flat.lastIndexOf(" ", end) > from ? flat.lastIndexOf(" ", end) : end;
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}
