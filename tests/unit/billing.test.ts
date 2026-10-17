/**
 * Paying output/input for the plan (Stage 39b): the small rules and words.
 */
import { describe, expect, test } from "vitest";
import { billingLine, cardExpiry, cardWords, nextMonth, statusFromStripe } from "@/modules/billing/billing";

describe("billing words", () => {
  test("Stripe's statuses, in ours", () => {
    expect(statusFromStripe("active")).toBe("active");
    expect(statusFromStripe("trialing")).toBe("active");
    expect(statusFromStripe("past_due")).toBe("past_due");
    expect(statusFromStripe("unpaid")).toBe("past_due");
    expect(statusFromStripe("incomplete")).toBe("incomplete");
    expect(statusFromStripe("incomplete_expired")).toBe("canceled");
    expect(statusFromStripe("canceled")).toBe("canceled");
  });

  test("the card, as people say it", () => {
    expect(cardWords("visa", "4417")).toBe("Visa ending 4417");
    expect(cardWords("eftpos_au", "0001")).toBe("eftpos ending 0001");
    expect(cardWords("something_new", "1234")).toBe("Card ending 1234");
    expect(cardWords(null, null)).toBeNull();
    expect(cardExpiry(9, 2028)).toBe("09/28");
    expect(cardExpiry(12, 2034)).toBe("12/34");
    expect(cardExpiry(null, 2028)).toBeNull();
  });

  test("a month on, the same day where there is one", () => {
    expect(nextMonth(new Date("2026-10-17T05:00:00Z")).toISOString()).toBe("2026-11-17T05:00:00.000Z");
    expect(nextMonth(new Date("2027-01-31T00:00:00Z")).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(nextMonth(new Date("2026-12-15T00:00:00Z")).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  test("ops' one-liner", () => {
    expect(billingLine(null)).toBe("Not paying yet");
    expect(billingLine({ status: "active" })).toBe("Paying by card");
    expect(billingLine({ status: "past_due" })).toBe("Last payment failed");
    expect(billingLine({ status: "canceled" })).toBe("Stopped");
  });
});
