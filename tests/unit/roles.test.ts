/**
 * Three roles, fixed (Carl, Oct 2026): an Owner does everything, a Manager
 * runs the shop and the site, Staff handle orders, the inbox and contacts.
 * The rule is written once, here; the nav, the pages and the module checks
 * all read it.
 */
import { describe, expect, test } from "vitest";
import { atLeast, canOpen, ROLE_NAMES, roleWords, sortByRole } from "@/modules/auth/roles";

describe("ranks", () => {
  test("owner over manager over staff; no role is nothing", () => {
    expect(atLeast("owner", "manager")).toBe(true);
    expect(atLeast("manager", "manager")).toBe(true);
    expect(atLeast("staff", "manager")).toBe(false);
    expect(atLeast("manager", "owner")).toBe(false);
    expect(atLeast("staff", "staff")).toBe(true);
    expect(atLeast(null, "staff")).toBe(false);
    expect(atLeast(undefined, "staff")).toBe(false);
  });

  test("names, and the words Activity uses", () => {
    expect(ROLE_NAMES).toEqual({ owner: "Owner", manager: "Manager", staff: "Staff" });
    expect(roleWords("owner")).toBe("an owner");
    expect(roleWords("manager")).toBe("a manager");
    expect(roleWords("staff")).toBe("staff");
  });

  test("a team lists owners, then managers, then staff, each by name", () => {
    const people = [
      { name: "Zed", role: "staff" as const },
      { name: "Amy", role: "manager" as const },
      { name: "Bo", role: "owner" as const },
      { name: "Al", role: "staff" as const },
    ];
    expect(sortByRole(people).map((p) => p.name)).toEqual(["Bo", "Amy", "Al", "Zed"]);
  });
});

describe("screens", () => {
  test("staff see Home, Orders, the inbox, contacts, their own account and Get help", () => {
    for (const href of ["/", "/orders", "/orders/abc", "/inbox", "/inbox/abc", "/contacts", "/contacts/merge", "/account", "/help"]) {
      expect(canOpen("staff", href), href).toBe(true);
    }
    for (const href of ["/products", "/pages", "/pages/abc", "/media", "/forms", "/articles", "/menus", "/settings", "/settings/shop", "/team", "/activity", "/ordersx"]) {
      expect(canOpen("staff", href), href).toBe(false);
    }
  });

  test("managers and owners see everything", () => {
    for (const role of ["manager", "owner"] as const) {
      for (const href of ["/", "/products", "/settings/payments", "/team", "/activity", "/media"]) expect(canOpen(role, href), `${role} ${href}`).toBe(true);
    }
  });
});
