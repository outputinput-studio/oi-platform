import { describe, expect, test } from "vitest";
import { analyticsSchema, canTrack, cookieNoticeSchema, gaSnippet, pixelSnippet, readAnalytics, readCookieNotice } from "@/modules/sites/tracking";
import { customCodeSchema, readCustomCode, withSave, withRevert } from "@/modules/sites/custom-code-rules";

describe("analytics IDs", () => {
  test("an ID on its own, or pulled out of the whole snippet someone pasted", () => {
    expect(analyticsSchema.parse({ gaId: " g-ab12cd34ef ", metaPixelId: "1234567890123456" })).toEqual({ gaId: "G-AB12CD34EF", metaPixelId: "1234567890123456" });
    const pastedGa = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ZX81QW7Y0P"></script><script>gtag('config', 'G-ZX81QW7Y0P');</script>`;
    const pastedPixel = `<script>!function(f,b,e,v,n,t,s){...}; fbq('init', '987654321012345'); fbq('track', 'PageView');</script>`;
    expect(analyticsSchema.parse({ gaId: pastedGa, metaPixelId: pastedPixel })).toEqual({ gaId: "G-ZX81QW7Y0P", metaPixelId: "987654321012345" });
    expect(analyticsSchema.parse({})).toEqual({ gaId: "", metaPixelId: "" });
  });

  test("anything else is refused, pointing at its box", () => {
    expect(analyticsSchema.safeParse({ gaId: "UA-12345-1" }).error?.issues[0]).toMatchObject({ path: ["gaId"], message: expect.stringContaining("G-") });
    expect(analyticsSchema.safeParse({ metaPixelId: "pixel" }).error?.issues[0]).toMatchObject({ path: ["metaPixelId"] });
    expect(readAnalytics({ gaId: "<script>" })).toEqual({ gaId: "", metaPixelId: "" });
  });

  test("the snippets carry only the ID, quoted", () => {
    expect(gaSnippet("G-AB12CD34EF")).toContain(`gtag("config", "G-AB12CD34EF")`);
    expect(pixelSnippet("1234567890123456")).toContain(`fbq("init", "1234567890123456")`);
    expect(() => gaSnippet(`G-1"); alert(1); ("`)).toThrow();
    expect(() => pixelSnippet("1); alert(1")).toThrow();
  });
});

describe("the cookie notice", () => {
  test("off by default, with a plain message; a privacy page is a path on the site", () => {
    expect(readCookieNotice({})).toMatchObject({ enabled: false, policyPath: "" });
    expect(readCookieNotice({}).message.length).toBeGreaterThan(10);
    expect(cookieNoticeSchema.safeParse({ enabled: true, message: "Hi", policyPath: "https://evil.example" }).success).toBe(false);
    expect(cookieNoticeSchema.parse({ enabled: true, message: "Cookies, yes.", policyPath: "/privacy" })).toMatchObject({ policyPath: "/privacy" });
  });

  test("analytics load without a notice; with one, only after Accept", () => {
    expect(canTrack({ enabled: false }, undefined)).toBe(true);
    expect(canTrack({ enabled: true }, undefined)).toBe(false);
    expect(canTrack({ enabled: true }, "no")).toBe(false);
    expect(canTrack({ enabled: true }, "yes")).toBe(true);
  });
});

describe("custom code", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 3, m)).toISOString();
  test("each save keeps what was there before; ten versions back at most", () => {
    let c = readCustomCode({});
    expect(c).toEqual({ head: "", body: "", at: "", by: "", history: [] });
    c = withSave(c, { head: "<script>a()</script>", body: "" }, { at: at(0), by: "Carl" });
    expect(c.history).toEqual([]); // nothing was there before
    c = withSave(c, { head: "<script>b()</script>", body: "<p>hi</p>" }, { at: at(1), by: "Carl" });
    expect(c.history).toEqual([{ head: "<script>a()</script>", body: "", at: at(0), by: "Carl" }]);
    for (let i = 2; i < 20; i++) c = withSave(c, { head: `<script>v${i}()</script>`, body: "" }, { at: at(i), by: "Carl" });
    expect(c.history).toHaveLength(10);
    expect(c.history[0].head).toBe("<script>v18()</script>");
  });

  test("saving the same thing again adds nothing; putting one back keeps the current one too", () => {
    let c = withSave(readCustomCode({}), { head: "<b>1</b>", body: "" }, { at: at(0), by: "Carl" });
    c = withSave(c, { head: "<b>2</b>", body: "" }, { at: at(1), by: "Mia" });
    expect(withSave(c, { head: "<b>2</b>", body: "" }, { at: at(2), by: "Mia" })).toEqual(c);
    const back = withRevert(c, at(0), { at: at(3), by: "Carl" });
    expect(back).toMatchObject({ head: "<b>1</b>", body: "" });
    expect(back.history[0]).toMatchObject({ head: "<b>2</b>", by: "Mia" });
    expect(() => withRevert(c, at(9), { at: at(4), by: "Carl" })).toThrow(/isn't there/);
  });

  test("a size limit per box", () => {
    expect(customCodeSchema.safeParse({ head: "x".repeat(20_001), body: "" }).error?.issues[0].path).toEqual(["head"]);
  });
});
