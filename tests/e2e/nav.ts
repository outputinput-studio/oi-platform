import type { Locator, Page } from "@playwright/test";

/**
 * Go somewhere by the main navigation. On a phone, Team, Settings and
 * Your account live behind "More", which opens a sheet; open it first.
 */
export async function goTo(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  const link = nav.getByRole("link", { name: label, exact: true });
  if (await link.isVisible()) return link.click();
  await nav.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: label, exact: true }).click();
}

/** A folded section card opens on tap; an open one is left alone. */
export async function openSection(section: Locator) {
  await section.waitFor();
  const folded = section.locator('button[aria-expanded="false"]').first();
  if (await folded.count()) await folded.click();
}
