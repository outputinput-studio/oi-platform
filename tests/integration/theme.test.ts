/**
 * The site's look: owner-only, validated, and rendered as CSS variables.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { siteSettings, siteTheme, updateTheme } from "@/modules/sites/server";
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
