import type { MembershipRole } from "@/db/schema";

/**
 * Three roles, fixed (Carl, Oct 2026). An Owner can do everything,
 * including the team, payment keys, the domain, custom code and going
 * live. A Manager runs the shop and the site, refunds included. Staff
 * handle orders, the inbox and contacts.
 *
 * Written once, here, and pure so the nav (a client component) can read
 * it too. Module functions enforce it through `assertAccess`; pages and
 * the nav only use it to hide what someone can't open.
 */

const RANK: Record<MembershipRole, number> = { staff: 0, manager: 1, owner: 2 };

/** Does this role reach `min`? No role (not a member) reaches nothing. */
export function atLeast(role: MembershipRole | null | undefined, min: MembershipRole): boolean {
  return !!role && RANK[role] >= RANK[min];
}

export const ROLE_NAMES: Record<MembershipRole, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };

/** What each role is for, in the words the Change role sheet uses. */
export const ROLE_ABOUT: Record<MembershipRole, string> = {
  owner: "Everything, including the team, payments, the domain and custom code.",
  manager: "Runs the shop and the site: products, pages, images, refunds and settings.",
  staff: "Orders, the inbox and contacts.",
};

/** "made Ben a manager", "added Sam to the team as staff". */
export function roleWords(role: MembershipRole): string {
  return role === "owner" ? "an owner" : role === "manager" ? "a manager" : "staff";
}

/** Owners, then managers, then staff; by name within each. */
export function sortByRole<T extends { role: MembershipRole; name: string }>(people: T[]): T[] {
  return [...people].sort((a, b) => RANK[b.role] - RANK[a.role] || a.name.localeCompare(b.name));
}

/** The screens Staff open. Everything else in the admin needs a Manager. */
const STAFF_SCREENS = ["/orders", "/inbox", "/contacts", "/account"];

/** May this role open this admin screen (a public path, like "/settings/shop")? */
export function canOpen(role: MembershipRole | null | undefined, href: string): boolean {
  if (atLeast(role, "manager")) return true;
  if (!atLeast(role, "staff")) return false;
  return href === "/" || STAFF_SCREENS.some((s) => href === s || href.startsWith(s + "/"));
}
