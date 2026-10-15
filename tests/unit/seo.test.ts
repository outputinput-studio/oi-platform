import { describe, expect, test } from "vitest";
import { readSeo, summarise } from "@/modules/pages/seo";

describe("seo", () => {
  test("reads with defaults and survives junk", () => {
    expect(readSeo({})).toEqual({ title: "", description: "", image: null, noindex: false });
    expect(readSeo("nope")).toEqual({ title: "", description: "", image: null, noindex: false });
    expect(readSeo({ title: "  Hi  ", noindex: true })).toMatchObject({ title: "Hi", noindex: true });
    // A bad image means the row is unreadable: defaults, never a crash on the storefront.
    expect(readSeo({ title: "Hi", image: { bad: true } }).title).toBe("");
  });
  test("summarise cuts at a sentence or a word, never mid-word", () => {
    expect(summarise("Short.")).toBe("Short.");
    const long = "A single connector bikini takes about eleven hours. Most of that is crystal work, each stone placed by hand following the print rather than covering it, which is slow but worth it.";
    const s = summarise(long);
    expect(s.length).toBeLessThanOrEqual(161);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toMatch(/^A single connector bikini takes about eleven hours\./);
  });
});
