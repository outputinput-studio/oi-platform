import { describe, expect, test } from "vitest";
import { environmentName } from "@/lib/env";

describe("environmentName", () => {
  test("reads OI_ENV when set", () => {
    process.env.DATABASE_URL = "postgresql://app:x@localhost:5432/oi";
    process.env.OI_ENV = "staging";
    expect(environmentName()).toBe("staging");
  });
});
