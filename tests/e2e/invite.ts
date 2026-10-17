import { expect, type Browser, type Page } from "@playwright/test";
import { SIGNED_OUT } from "./state";

/**
 * Inviting someone and joining from the link, the way people do it
 * (Stage 38): the Owner invites from Team, the link (read off Team, as
 * "Copy the link" would give it) is opened in a fresh browser, Join, then
 * the emailed code.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");

/** From an Owner's page already in the site: invite, and return the link. */
export async function invite(owner: Page, email: string, role: "Owner" | "Manager" | "Staff" = "Staff"): Promise<string> {
  await owner.goto(admin + "/team");
  await owner.getByRole("button", { name: "Invite someone" }).click();
  const sheet = owner.getByRole("dialog");
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
  await sheet.getByRole("button", { name: "Send invitation" }).click();
  const row = owner.getByTestId(`invite-${email}`).first();
  await expect(row).toContainText("Sent");
  return (await row.getByTestId("invite-link").textContent())!.trim().replace(/^https:\/\/[^/]+/, admin);
}

/** A fresh, signed-out browser joins from the link and signs in with the emailed code. */
export async function join(browser: Browser, link: string, viewport = { width: 1200, height: 900 }): Promise<Page> {
  const p = await (await browser.newContext({ viewport, storageState: SIGNED_OUT })).newPage();
  await p.goto(link);
  await p.getByRole("button", { name: /^Join / }).click();
  await expect(p).toHaveURL(/\/sign-in\?email=/);
  await expect(p.getByText("You're on the team.")).toBeVisible();
  await p.getByRole("button", { name: "Send code" }).click();
  await p.getByLabel("Code").fill((await p.getByTestId("dev-code").textContent())!);
  await p.getByRole("button", { name: "Sign in" }).click();
  return p;
}
