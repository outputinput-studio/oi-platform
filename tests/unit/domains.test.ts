import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanDomain, hostsFor, isApex, recordsFor } from "@/lib/domains";
import { adminOriginFor, platformBaseOf, publicHost } from "@/lib/hosts";
import { addProjectDomain, domainConfig, removeProjectDomain, VercelError } from "@/lib/vercel";
import { fromLine } from "@/lib/email";

const platform = ["outputinput.co", "localhost"];

describe("a client's own domain", () => {
  test("what they type becomes a clean host name", () => {
    expect(cleanDomain("https://WWW.KiniKouture.com.au/shop?x=1", platform)).toEqual({ ok: true, domain: "kinikouture.com.au", www: true });
    expect(cleanDomain(" kinikouture.com.au. ", platform)).toEqual({ ok: true, domain: "kinikouture.com.au", www: false });
    expect(cleanDomain("shop.kini.co.th", platform)).toEqual({ ok: true, domain: "shop.kini.co.th", www: false });
    expect(cleanDomain("ร้าน.com", platform)).toMatchObject({ ok: true, domain: "xn--q3ct9b5e.com" });
  });

  test("refused: not a domain, an ending, an IP, the platform's own, its doors", () => {
    for (const bad of ["", "kini", "kini..com", "-kini.com", "kini.c", "com.au", "203.0.113.9", "kini.outputinput.co", "x.vercel.app", "admin.kini.com", "ops.kini.com.au"]) expect(cleanDomain(bad, platform).ok, bad).toBe(false);
    expect(cleanDomain("com.au", platform)).toMatchObject({ message: expect.stringContaining("kinikouture.com.au") });
  });

  test("a domain of its own answers with and without www; a subdomain just the once", () => {
    expect([isApex("kini.com"), isApex("kinikouture.com.au"), isApex("shop.kini.com"), isApex("shop.kini.com.au")]).toEqual([true, true, false, false]);
    expect(hostsFor("kinikouture.com.au", false)).toEqual({ primary: "kinikouture.com.au", other: "www.kinikouture.com.au" });
    expect(hostsFor("kinikouture.com.au", true)).toEqual({ primary: "www.kinikouture.com.au", other: "kinikouture.com.au" });
    expect(hostsFor("shop.kini.com", true)).toEqual({ primary: "shop.kini.com", other: null });
  });

  test("records: an A for the domain, a CNAME for www; found, waiting or not right", () => {
    expect(recordsFor("kini.com", { a: ["76.76.21.21"], cname: { "www.kini.com": null } })).toEqual([
      { type: "A", name: "kini.com", value: "76.76.21.21", status: "found" },
      { type: "CNAME", name: "www.kini.com", value: "cname.vercel-dns.com", status: "waiting" },
    ]);
    expect(recordsFor("kini.com", { a: ["1.2.3.4"], cname: { "www.kini.com": "CNAME.VERCEL-DNS.COM." } }).map((r) => r.status)).toEqual(["wrong", "found"]);
    // Vercel's own recommendation counts as well as the default.
    expect(recordsFor("kini.com", { a: ["216.198.79.1"], cname: {} }, { a: ["216.198.79.1", "76.76.21.21"], cname: ["abc.vercel-dns-017.com", "cname.vercel-dns.com"] })[0]).toMatchObject({ value: "216.198.79.1", status: "found" });
    expect(recordsFor("shop.kini.com", { a: [], cname: { "shop.kini.com": "cname.vercel-dns.com" } })).toEqual([{ type: "CNAME", name: "shop.kini.com", value: "cname.vercel-dns.com", status: "found" }]);
  });
});

describe("addresses between the surfaces", () => {
  const bases = ["outputinput.co", "localhost"];
  test("the admin from a storefront host of either kind", () => {
    expect(platformBaseOf("kini.outputinput.co", bases)).toBe("outputinput.co");
    expect(platformBaseOf("kinikouture.com.au", bases)).toBeNull();
    expect(adminOriginFor("kini.outputinput.co", bases)).toBe("https://admin.outputinput.co");
    expect(adminOriginFor("kinikouture.com.au", bases)).toBe("https://admin.outputinput.co");
    expect(adminOriginFor("www.kinikouture.com.au", bases)).toBe("https://admin.outputinput.co");
    expect(adminOriginFor("demo.localhost", bases)).toBe("https://admin.localhost");
  });

  test("the public address: the own domain once it's been seen working", () => {
    const site = { domain: "kinikouture.com.au", domainWww: true, domainOkAt: null as Date | null };
    expect(publicHost(site, "kini.outputinput.co")).toBe("kini.outputinput.co");
    expect(publicHost({ ...site, domainOkAt: new Date() }, "kini.outputinput.co")).toBe("www.kinikouture.com.au");
    expect(publicHost({ domain: null, domainWww: false, domainOkAt: null }, "demo.localhost:3000")).toBe("demo.localhost");
  });

  test("emails from the client's own address once verified", () => {
    expect(fromLine("output/input <mail@outputinput.co>", "Kini Kouture")).toBe("Kini Kouture <mail@outputinput.co>");
    expect(fromLine("output/input <mail@outputinput.co>", "Kini Kouture", "orders@kinikouture.com.au")).toBe("Kini Kouture <orders@kinikouture.com.au>");
    expect(fromLine("output/input <mail@outputinput.co>", "Kini", "not an address")).toBe("Kini <mail@outputinput.co>");
  });
});

describe("the Vercel calls", () => {
  const cfg = { token: "t0k3n", projectId: "prj_1", teamId: "team_1", environmentId: "env_staging" };
  const calls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  afterEach(() => {
    vi.unstubAllGlobals();
    calls.length = 0;
  });
  const stub = (answer: (url: string, method: string) => Response) =>
    vi.stubGlobal("fetch", async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>).authorization });
      return answer(String(url), init.method ?? "GET");
    });

  test("adding: on the team's project, staging's environment, redirecting the other address", async () => {
    stub(() => reply(200, { name: "www.kini.com", verified: true }));
    await addProjectDomain(cfg, "www.kini.com", "kini.com");
    expect(calls[0]).toEqual({ url: "https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_1", method: "POST", body: { name: "www.kini.com", redirect: "kini.com", redirectStatusCode: 308, customEnvironmentId: "env_staging" }, auth: "Bearer t0k3n" });
  });

  test("already on this project, on our side: fine, and its redirect is put right", async () => {
    stub((url, method) => (method === "POST" ? reply(409, { error: { code: "domain_already_in_use_by_project", message: "already assigned to this project" } }) : reply(200, { name: "www.kini.com", verified: true, redirect: null, customEnvironmentId: "env_staging" })));
    await addProjectDomain(cfg, "www.kini.com", "kini.com");
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "PATCH"]);
    expect(calls[2].body).toEqual({ redirect: "kini.com", redirectStatusCode: 308 });
  });

  test("on this project but the other side (staging vs live): refused, and left exactly as it was", async () => {
    stub((url, method) => (method === "POST" ? reply(409, { error: { code: "domain_already_in_use_by_project", message: "already assigned to this project" } }) : reply(200, { name: "kini.com", verified: true, redirect: null, customEnvironmentId: null })));
    await expect(addProjectDomain(cfg, "www.kini.com", "kini.com")).rejects.toMatchObject({ status: 409, code: "domain_in_other_environment" });
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET"]);
    // Production's view: one on staging's environment, or on a branch, isn't ours either.
    const live = { ...cfg, environmentId: undefined };
    calls.length = 0;
    vi.unstubAllGlobals();
    stub((url, method) => (method === "GET" ? reply(200, { name: "kini.com", verified: true, customEnvironmentId: "env_staging" }) : reply(200, {})));
    await removeProjectDomain(live, "kini.com");
    vi.unstubAllGlobals();
    stub((url, method) => (method === "GET" ? reply(200, { name: "kini.com", verified: true, customEnvironmentId: null, gitBranch: "stage-35" }) : reply(200, {})));
    await removeProjectDomain(live, "kini.com");
    expect(calls.map((c) => c.method)).toEqual(["GET", "GET"]);
  });

  test("someone else's: an error that says so; removing what isn't there is fine; removing ours does", async () => {
    stub(() => reply(409, { error: { code: "domain_taken", message: "The domain is in use by another account" } }));
    await expect(addProjectDomain(cfg, "kini.com")).rejects.toBeInstanceOf(VercelError);
    vi.unstubAllGlobals();
    stub(() => reply(404, { error: { code: "not_found" } }));
    await expect(removeProjectDomain(cfg, "kini.com")).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    calls.length = 0;
    stub((url, method) => (method === "GET" ? reply(200, { name: "kini.com", verified: true, customEnvironmentId: "env_staging" }) : reply(200, {})));
    await removeProjectDomain(cfg, "kini.com");
    expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });

  test("staging's environment on staging; never on production, even if the variable is set there too", async () => {
    const configIn = async (where: "staging" | "production") => {
      vi.resetModules();
      vi.stubEnv("DATABASE_URL", "postgresql://unit:unit@localhost:5432/unit");
      vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret-long-enough-to-pass-ok");
      vi.stubEnv("OI_ENV", where);
      vi.stubEnv("OI_VERCEL_TOKEN", "t0k3n-long-enough");
      vi.stubEnv("OI_VERCEL_PROJECT_ID", "prj_1");
      vi.stubEnv("OI_VERCEL_ENVIRONMENT_ID", "env_staging");
      return (await import("@/lib/vercel")).vercelConfig();
    };
    try {
      expect((await configIn("staging"))?.environmentId).toBe("env_staging");
      const prod = await configIn("production");
      expect(prod).toMatchObject({ token: "t0k3n-long-enough", projectId: "prj_1" });
      expect(prod?.environmentId).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  test("config: misconfigured or not, with Vercel's recommended records first", async () => {
    stub(() => reply(200, { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ["216.198.79.1"] }], recommendedCNAME: [{ rank: 1, value: "abc.vercel-dns-017.com." }] }));
    expect(await domainConfig(cfg, "kini.com")).toEqual({ misconfigured: false, a: ["216.198.79.1", "76.76.21.21"], cname: ["abc.vercel-dns-017.com", "cname.vercel-dns.com"] });
  });
});
