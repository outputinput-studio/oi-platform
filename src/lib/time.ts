/**
 * "Edited 3 days ago" — the words a person expects next to a page, not a
 * timestamp. Rounds down; anything under a minute is "just now".
 */
export function timeAgo(then: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "yesterday" : `${d} days ago`;
  const w = Math.floor(d / 7);
  if (d < 30) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (d < 365) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

/** "2 minutes", "1 minute", "an hour", "30 seconds": a wait in words. */
export function waitText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} second${Math.ceil(seconds) === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  if (m >= 60) return "an hour";
  return `${m} minute${m === 1 ? "" : "s"}`;
}
