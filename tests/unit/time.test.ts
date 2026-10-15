import { describe, expect, test } from "vitest";
import { timeAgo } from "@/lib/time";

const now = new Date("2026-10-15T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("timeAgo", () => {
  test("reads like a person", () => {
    expect(timeAgo(ago(10_000), now)).toBe("just now");
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 min ago");
    expect(timeAgo(ago(3600_000), now)).toBe("1 hour ago");
    expect(timeAgo(ago(26 * 3600_000), now)).toBe("yesterday");
    expect(timeAgo(ago(3 * 86400_000), now)).toBe("3 days ago");
    expect(timeAgo(ago(15 * 86400_000), now)).toBe("2 weeks ago");
    expect(timeAgo(ago(40 * 86400_000), now)).toBe("1 month ago");
    expect(timeAgo(ago(800 * 86400_000), now)).toBe("2 years ago");
  });
});
