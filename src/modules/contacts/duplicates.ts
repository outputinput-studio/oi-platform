/**
 * Spotting the same person twice (design/admin.html, Merge contacts).
 * Pure: the contacts module loads the rows, these decide.
 *
 * Two contacts are a possible duplicate when they share a phone number
 * (however it's written: the last nine digits match) or have the same
 * full name (two words or more, ignoring case and spacing). A pair the
 * team has said are different people is never suggested again. Emails
 * can't match: one contact per address is already the rule.
 */

export type DupRow = { id: string; name: string; phone: string; notSame: string[] };
export type DupPair = { a: string; b: string; reason: string };

/** The last nine digits, so 0425 779 122 and +61 425 779 122 match. Too short to mean anything: null. */
export function phoneKey(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-9) : null;
}

function nameKey(name: string): string | null {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? words.join(" ") : null;
}

/** Pairs, in the order the rows came (most recent first, as the module loads them). */
export function duplicatePairs(rows: DupRow[]): DupPair[] {
  const seen = new Set<string>();
  const out: DupPair[] = [];
  const consider = (groups: Map<string, DupRow[]>, reason: string) => {
    for (const group of groups.values()) {
      // A big group is a shared office number, not one person: leave it.
      if (group.length < 2 || group.length > 6) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const [x, y] = [group[i], group[j]];
          const pair = [x.id, y.id].sort().join(":");
          if (seen.has(pair) || x.notSame.includes(y.id) || y.notSame.includes(x.id)) continue;
          seen.add(pair);
          out.push({ a: x.id, b: y.id, reason });
        }
      }
    }
  };
  const byPhone = new Map<string, DupRow[]>();
  const byName = new Map<string, DupRow[]>();
  for (const r of rows) {
    const p = phoneKey(r.phone);
    if (p) byPhone.set(p, [...(byPhone.get(p) ?? []), r]);
    const n = nameKey(r.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), r]);
  }
  consider(byPhone, "These two share a phone number.");
  consider(byName, "These two have the same name.");
  return out;
}

export type ContactValues = { name: string; email: string; phone: string };
export type MergePick = { name: "a" | "b"; email: "a" | "b"; phone: "a" | "b" };

/** What the one contact keeps: the side picked for each, or whichever side has a value when only one does. */
export function mergedValues(a: ContactValues, b: ContactValues, pick: MergePick): ContactValues {
  const one = (k: keyof ContactValues) => (pick[k] === "b" ? b[k] || a[k] : a[k] || b[k]);
  return { name: one("name"), email: one("email"), phone: one("phone") };
}

/** The fields worth asking about: both have one, and they differ (a phone number written two ways doesn't). */
export function differing(a: ContactValues, b: ContactValues): (keyof ContactValues)[] {
  const same = (k: keyof ContactValues) => {
    if (k === "phone" && phoneKey(a.phone) && phoneKey(a.phone) === phoneKey(b.phone)) return true;
    return a[k].trim().toLowerCase() === b[k].trim().toLowerCase();
  };
  return (["name", "email", "phone"] as const).filter((k) => a[k] && b[k] && !same(k));
}
