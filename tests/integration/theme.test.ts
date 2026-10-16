/**
 * The site's look: owner-only, validated, and rendered as CSS variables.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { siteSearch, siteSettings, siteTheme, updateSearchSettings, updateTheme } from "@/modules/sites/server";
import { pageTitle } from "@/modules/sites/search";
import { parseTheme, readTheme, themeVars } from "@/modules/sites/theme";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let site = "";
const ann = "test-theme-ann"; // staff
const bob = "test-theme-bob"; // owner

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug = 'theme-a'`);
  site = (await owner.query(`insert into sites (slug, name) values ('theme-a','Theme A') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@theme.invalid',true,now()), ($2,'Bob','bob@theme.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$3,'owner')`, [ann, bob, site]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug = 'theme-a'`);
  await owner.end();
});

describe("theme", () => {
  test("defaults to dark with the O/I blue; reads survive junk, writes don't", () => {
    expect(parseTheme({})).toEqual({ mode: "dark", accent: "#2060ee" });
    expect(readTheme("nonsense")).toEqual({ mode: "dark", accent: "#2060ee" });
    expect(readTheme({ mode: "purple" })).toEqual({ mode: "dark", accent: "#2060ee" });
    expect(() => parseTheme({ mode: "purple" })).toThrow();
  });
  test("light mode changes the palette; the accent flows through", () => {
    const dark = themeVars({ mode: "dark", accent: "#cc3333" });
    const light = themeVars({ mode: "light", accent: "#cc3333" });
    expect(dark["--bg"]).not.toEqual(light["--bg"]);
    expect(dark["--accent"]).toBe("#cc3333");
    expect(light["--accent"]).toBe("#cc3333");
  });
});

describe("updateTheme", () => {
  test("an owner can change it and it comes back from settings", async () => {
    const t = await updateTheme({ actorId: bob, siteId: site, theme: { mode: "light", accent: "#AA00FF" } });
    expect(t).toEqual({ mode: "light", accent: "#aa00ff" });
    expect(siteTheme(await siteSettings({ actorId: bob, siteId: site }))).toEqual(t);
  });
  test("staff cannot", async () => {
    await expect(updateTheme({ actorId: ann, siteId: site, theme: { mode: "dark" } })).rejects.toBeInstanceOf(AccessError);
  });
  test("a bad colour is refused and nothing changes", async () => {
    await expect(updateTheme({ actorId: bob, siteId: site, theme: { mode: "dark", accent: "red" } })).rejects.toThrow();
    expect(siteTheme(await siteSettings({ actorId: bob, siteId: site })).mode).toBe("light");
  });
});

describe("search engines", () => {
  test("titles follow the pattern; the front page is just the site", () => {
    expect(pageTitle("[Page name] · [Site name]", "About", "Kini")).toBe("About · Kini");
    expect(pageTitle("[Site name] — [Page name]", "About", "Kini")).toBe("Kini — About");
    expect(pageTitle("[Page name] · [Site name]", "Kini", "Kini")).toBe("Kini");
    expect(pageTitle("", "About", "Kini")).toBe("About · Kini");
  });
  test("an owner saves them; a bad link is refused; staff can't", async () => {
    const r = await updateSearchSettings({ actorId: bob, siteId: site, settings: { titlePattern: "[Site name]: [Page name]", hideFromSearch: true, searchConsole: "google-site-verification=abc123", business: { name: "Theme A Pty", instagram: "https://www.instagram.com/themea" } } });
    expect(r.searchConsole).toBe("abc123");
    expect(r.business.instagram).toBe("https://www.instagram.com/themea");
    expect(siteSearch(await siteSettings({ actorId: bob, siteId: site })).hideFromSearch).toBe(true);
    await expect(updateSearchSettings({ actorId: bob, siteId: site, settings: { business: { facebook: "facebook.com/x" } } })).rejects.toThrow(/full address/);
    await expect(updateSearchSettings({ actorId: ann, siteId: site, settings: {} })).rejects.toThrow(AccessError);
  });
});
