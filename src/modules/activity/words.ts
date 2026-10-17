/**
 * Activity rows into words. Pure, so the list and its tests share it.
 * An action reads after the person's name: "{s}" is where the subject
 * (shown highlighted) goes, "{n}" the count ("added {n} photos" → "added
 * a photo" for one).
 */
export function activityParts(
  action: string,
  subject: string,
  count: number,
): { before: string; subject: string; after: string } {
  let a = count === 1 ? action.replace(/\{n\} (\w+?)s\b/, "a $1") : action;
  a = a.replace("{n}", String(count));
  const i = a.indexOf("{s}");
  if (i < 0) return { before: a, subject: "", after: "" };
  return { before: a.slice(0, i), subject, after: a.slice(i + 3) };
}

/**
 * Who did it. `null` is output/input itself (no person); `undefined` is a
 * person who's since been removed from the platform.
 */
export function firstName(user: { name: string; email: string } | null | undefined): string {
  if (user === null) return "output/input";
  if (!user) return "Someone";
  return user.name.trim().split(/\s+/)[0] || user.email.split("@")[0] || "Someone";
}
