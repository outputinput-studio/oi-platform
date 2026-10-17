/** Where an invitation stands, as Team shows it (design/admin.html). */
import { describe, expect, test } from "vitest";
import { INVITE_DAYS, inviteStatus } from "@/modules/team/invite-status";

const now = new Date("2026-09-01T00:00:00Z");
const base = { sentAt: new Date("2026-08-30T00:00:00Z"), expiresAt: new Date("2026-09-13T00:00:00Z"), openedAt: null, acceptedAt: null, cancelledAt: null };

describe("invitation status", () => {
  test("fourteen days", () => expect(INVITE_DAYS).toBe(14));
  test("sent, then opened, then accepted", () => {
    expect(inviteStatus(base, now)).toBe("sent");
    expect(inviteStatus({ ...base, openedAt: now }, now)).toBe("opened");
    expect(inviteStatus({ ...base, openedAt: now, acceptedAt: now }, now)).toBe("accepted");
  });
  test("cancelled beats everything but accepted; expired once the date passes", () => {
    expect(inviteStatus({ ...base, cancelledAt: now }, now)).toBe("cancelled");
    expect(inviteStatus(base, new Date("2026-09-13T00:00:01Z"))).toBe("expired");
    expect(inviteStatus({ ...base, acceptedAt: now }, new Date("2026-10-01T00:00:00Z"))).toBe("accepted");
  });
});
