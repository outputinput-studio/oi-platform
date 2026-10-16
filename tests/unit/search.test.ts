import { describe, expect, test } from "vitest";
import { likePattern, searchWords, snippet } from "@/lib/search";

describe("site search, the pure parts", () => {
  test("what's typed becomes words: lower case, no stray punctuation, no repeats, six at most", () => {
    expect(searchWords("  Linen   ROBE, linen! ")).toEqual(["linen", "robe"]);
    expect(searchWords("a b c d e f g h")).toHaveLength(6);
    expect(searchWords("   ")).toEqual([]);
    expect(searchWords("ซาวน่า ไม้")).toEqual(["ซาวน่า", "ไม้"]); // Thai, as typed
    expect(searchWords("x".repeat(500))[0]).toHaveLength(100);
  });

  test("LIKE's wildcards are taken literally", () => {
    expect(likePattern("50%")).toBe("%50\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("c:\\")).toBe("%c:\\\\%");
  });

  test("a snippet around the first match, cut on spaces", () => {
    const text = "We build every sauna by hand in our workshop. The barrel sauna takes six weeks and arrives flat-packed with the stove.";
    expect(snippet(text, ["stove"], 60)).toBe("…takes six weeks and arrives flat-packed with the stove.");
    expect(snippet(text, ["we"], 30)).toMatch(/^We build every sauna by hand…$/);
    expect(snippet(text, ["igloo"])).toBe("");
  });
});
