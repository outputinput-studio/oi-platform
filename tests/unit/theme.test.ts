import { describe, expect, test } from "vitest";
import { contrast, parseTheme, siteColours, themeVars } from "@/modules/sites/theme";

describe("site colours", () => {
  test("picked text and background give every other shade, and decide light or dark", () => {
    const t = parseTheme({ accent: "#e8cfd4", text: "#1b1a17", background: "#fbf9f5" });
    expect(t.mode).toBe("light");
    const v = themeVars(t);
    expect(v["--bg"]).toBe("#fbf9f5");
    expect(v["--text"]).toBe("#1b1a17");
    // In between, in order: body text nearer the text, muted further, lines nearer the background.
    expect(contrast(v["--text-body"], "#fbf9f5")).toBeGreaterThan(contrast(v["--text-muted"], "#fbf9f5"));
    expect(contrast(v["--border"], "#fbf9f5")).toBeLessThan(2);
    expect(parseTheme({ text: "#f0f0f0", background: "#101820" }).mode).toBe("dark");
  });

  test("a pale accent gets dark words on its buttons; a strong one white", () => {
    expect(themeVars(parseTheme({ accent: "#e8cfd4" }))["--accent-fg"]).toBe("#111111");
    expect(themeVars(parseTheme({ accent: "#2060ee" }))["--accent-fg"]).toBe("#ffffff");
  });

  test("no colours picked: the light or dark palette, as before", () => {
    expect(siteColours(parseTheme({ mode: "light" }))).toEqual({ text: "#1b1a17", background: "#faf9f5" });
    expect(themeVars(parseTheme({ mode: "dark" }))["--surface"]).toBe("#1a1a1a");
  });

  test("contrast is the WCAG ratio", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(() => parseTheme({ text: "black" })).toThrow(/hex|#2060EE/);
  });
});
