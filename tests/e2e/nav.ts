import type { Page } from "@playwright/test";

/**
 * Go somewhere by the main navigation. On a phone, Team, Settings and
 * Your account live behind "More", so open that first when needed.
 */
export async function goTo(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  const link = nav.getByRole("link", { name: label, exact: true });
  if (!(await link.isVisible())) await nav.getByRole("button", { name: "More" }).click();
  await link.click();
}
