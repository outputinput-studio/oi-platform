/**
 * Where an invitation stands, as Team shows it (design/admin.html): Sent,
 * Opened, Accepted — or Expired or Cancelled. Pure, for the tests.
 */
export const INVITE_DAYS = 14;

export type InviteStatus = "sent" | "opened" | "accepted" | "expired" | "cancelled";

export function inviteStatus(
  i: { expiresAt: Date; openedAt: Date | null; acceptedAt: Date | null; cancelledAt: Date | null },
  now: Date = new Date(),
): InviteStatus {
  if (i.acceptedAt) return "accepted";
  if (i.cancelledAt) return "cancelled";
  if (i.expiresAt <= now) return "expired";
  return i.openedAt ? "opened" : "sent";
}
