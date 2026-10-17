import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { readZip } from "../zip-reader";

/**
 * Export everything (Stage 40): the Owner asks on Settings, the link comes
 * by email (shown on screen here, with no email provider), and it downloads
 * one zip of the whole site. Contacts · Export this list gives a CSV.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 1280, height: 900 } });

/** Fetch from inside the page (its cookies, and the browser's own *.localhost names). */
async function grab(page: Page, href: string): Promise<{ status: number; type: string; disposition: string; body: Buffer }> {
  const r = await page.evaluate(async (url) => {
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return { status: res.status, type: res.headers.get("content-type") ?? "", disposition: res.headers.get("content-disposition") ?? "", b64: btoa(bin) };
  }, href);
  return { status: r.status, type: r.type, disposition: r.disposition, body: Buffer.from(r.b64, "base64") };
}

test("the Owner downloads everything as one zip, and a contact list as CSV", async ({ page }) => {
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /^Export everything/ }).click();
  await expect(page.getByRole("heading", { name: "Export everything" })).toBeVisible();
  await page.getByRole("button", { name: "Start the download" }).click();
  await expect(page.getByText(/Check your email\. The link is on its way to owner@example\.com/)).toBeVisible();

  const href = (await page.getByTestId("dev-export-link").getAttribute("href"))!;
  expect(href).toMatch(/^\/export\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{43}$/);
  const zip = await grab(page, href);
  expect(zip.status).toBe(200);
  expect(zip.type).toBe("application/zip");
  expect(zip.disposition).toMatch(/^attachment; filename="demo-\d{4}-\d{2}-\d{2}\.zip"$/);
  const files = readZip(zip.body);
  expect([...files.keys()]).toEqual(expect.arrayContaining(["products.csv", "orders.csv", "contacts.csv", "README.txt"]));
  expect(files.get("products.csv")!.toString()).toMatch(/^﻿Name,Web address/);

  // A mistyped link goes back to the page to ask again.
  await page.goto(admin + href.slice(0, -2) + "zz");
  await expect(page).toHaveURL(/\/settings\/export\?link=wrong$/);
  await expect(page.getByText("That download link isn't right.")).toBeVisible();

  // Contacts: the list as on screen.
  await page.goto(admin + "/contacts");
  await page.getByRole("button", { name: "Add someone" }).click();
  await page.getByLabel("Name").fill("Export Person");
  await page.getByLabel("Email").fill("export.person@example.com");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(page.getByRole("link", { name: "Export this contact" })).toBeVisible();
  await page.goto(admin + "/contacts");
  const csvLink = page.getByRole("link", { name: "Export this list as CSV" });
  const csv = await grab(page, (await csvLink.getAttribute("href"))!);
  expect(csv.type).toContain("text/csv");
  expect(csv.body.toString("utf8")).toMatch(/^﻿Name,Email,Phone,Notes,Orders,Total spent,Enquiries,First came in\r\n/);
  const download = page.waitForEvent("download");
  await csvLink.click();
  expect((await download).suggestedFilename()).toMatch(/^demo-contacts-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(readFileSync((await (await download).path())!, "utf8")).toContain("Name,Email");
});
