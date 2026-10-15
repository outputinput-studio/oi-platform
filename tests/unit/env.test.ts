import { describe, expect, test } from "vitest";
import { authHosts, environmentName } from "@/lib/env";

process.env.DATABASE_URL = "postgresql://app:x@localhost:5432/oi";
process.env.BETTER_AUTH_SECRET = "unit-test-secret-long-enough-to-pass-validation";
process.env.OI_ENV = "staging";

describe("env", () => {
  test("environmentName reads OI_ENV when set", () => {
    expect(environmentName()).toBe("staging");
  });

  test("authHosts defaults to localhost and trims a comma list", () => {
    expect(authHosts()).toEqual(["localhost", "*.localhost", "localhost:3000", "*.localhost:3000"]);
  });
});
