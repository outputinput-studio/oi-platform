import { describe, expect, test } from "vitest";
import { checkSvg, SvgRefused } from "@/lib/svg";

const logo = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="60" viewBox="0 0 240 60">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><style>.a{fill:url(#g)}</style></defs>
  <path class="a" d="M0 0h240v60H0z"/><use xlink:href="#g"/>
  <image href="data:image/png;base64,iVBORw0KGgo=" width="10" height="10"/>
</svg>`;

describe("SVG logos", () => {
  test("a plain exported logo passes, at its own size", () => {
    expect(checkSvg(logo)).toEqual({ width: 240, height: 60 });
    expect(checkSvg(`<svg viewBox="0 0 120 30"><path d="M0 0"/></svg>`)).toEqual({ width: 120, height: 30 });
    expect(checkSvg(`<svg width="100%" viewBox="0 0 8000 2000"/>`)).toEqual({ width: 4000, height: 1000 }); // fitted
    expect(checkSvg(`<svg><path/></svg>`)).toEqual({ width: 512, height: 512 });
  });

  test.each([
    [`<svg><script>alert(1)</script></svg>`, "script"],
    [`<svg onload="alert(1)"/>`, "events"],
    [`<svg><a href="javascript:alert(1)"><path/></a></svg>`, "script link"],
    [`<svg><a href="&#106;avascript:alert(1)"><path/></a></svg>`, "script link"],
    [`<svg><use href="https://evil.example/x.svg#a"/></svg>`, "outside"],
    [`<svg><foreignObject><iframe src="x"/></foreignObject></svg>`, "embedded"],
    [`<svg><style>@import url(https://evil.example/a.css);</style></svg>`, "another site"],
    [`<!DOCTYPE svg [<!ENTITY a "b">]><svg/>`, "entities"],
    [`<svg><image href="data:text/html;base64,PHNjcmlwdD4="/></svg>`, "script link"],
  ])("refuses %s", (svg, why) => {
    expect(() => checkSvg(svg)).toThrow(SvgRefused);
    expect(() => checkSvg(svg)).toThrow(new RegExp(why.split(" ")[0], "i"));
  });

  test("not an SVG at all, or too big", () => {
    expect(() => checkSvg("<html><body/></html>")).toThrow(/doesn't look like an SVG/);
    expect(() => checkSvg(`<svg>${"x".repeat(1024 * 1024)}</svg>`)).toThrow(/under 1 MB/);
  });
});
