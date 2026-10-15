import { describe, expect, test } from "vitest";
import { resolveSurface } from "@/lib/surface";

describe("resolveSurface", () => {
  test("admin host goes to the admin", () => {
    expect(resolveSurface("admin.outputinput.co")).toEqual({ surface: "admin", host: "admin.outputinput.co" });
  });
  test("ops host goes to operations", () => {
    expect(resolveSurface("ops.outputinput.tech:443")).toEqual({ surface: "ops", host: "ops.outputinput.tech" });
  });
  test("any other host is a storefront", () => {
    expect(resolveSurface("kinikouture.outputinput.co").surface).toBe("site");
    expect(resolveSurface("kinikouture.com.au").surface).toBe("site");
    expect(resolveSurface("localhost:3000")).toEqual({ surface: "site", host: "localhost" });
  });
  test("a missing host is still a storefront, never a privileged surface", () => {
    expect(resolveSurface(null).surface).toBe("site");
    expect(resolveSurface("").surface).toBe("site");
  });
  test("case and whitespace do not matter", () => {
    expect(resolveSurface(" ADMIN.Outputinput.CO ").surface).toBe("admin");
  });
});
