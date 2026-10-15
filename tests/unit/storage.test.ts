import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * R2 settings: all five, none, or a named complaint — and a half-set R2
 * switches pictures off rather than breaking the admin.
 */
const base = {
  DATABASE_URL: "postgresql://app:app@localhost:5433/x",
  BETTER_AUTH_SECRET: "local-test-secret-long-enough-to-pass-validation-ok",
  OI_ENV: "preview",
};

async function load(extra: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", base.DATABASE_URL);
  vi.stubEnv("BETTER_AUTH_SECRET", base.BETTER_AUTH_SECRET);
  vi.stubEnv("OI_ENV", base.OI_ENV);
  for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"]) vi.stubEnv(k, "");
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
  return { env: await import("@/lib/env"), storage: await import("@/lib/storage") };
}

const all = {
  R2_ACCOUNT_ID: "acc",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "oi-media",
  R2_PUBLIC_URL: "https://pub-x.r2.dev/",
};

afterEach(() => vi.unstubAllEnvs());

describe("r2 settings", () => {
  test("none set → local disk outside production", async () => {
    const { env, storage } = await load({});
    expect(env.r2Config()).toBeNull();
    expect(storage.storage()?.kind).toBe("local");
  });

  test("all set → R2, with the trailing slash trimmed off the public address", async () => {
    const { env, storage } = await load(all);
    expect(env.r2Config()?.publicUrl).toBe("https://pub-x.r2.dev");
    const s = storage.storage();
    expect(s?.kind).toBe("r2");
    expect(s?.url("a/b.jpg")).toBe("https://pub-x.r2.dev/a/b.jpg");
  });

  test("some set → names what's missing, and pictures are simply off", async () => {
    const { env, storage } = await load({ R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret" });
    expect(() => env.r2Config()).toThrow("Missing: R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_URL");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(storage.storage()).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
  });

  test("production without R2 → off, not local disk", async () => {
    const { storage } = await load({ OI_ENV: "production" });
    expect(storage.storage()).toBeNull();
  });
});
