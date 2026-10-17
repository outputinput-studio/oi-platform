import { describe, expect, test } from "vitest";
import { activityParts, firstName } from "@/modules/activity/words";
import { dayAndTime } from "@/lib/time";

describe("activity, in words", () => {
  test("the subject sits where {s} is: in the middle, at the end, or nowhere", () => {
    expect(activityParts("set {s} to sold out", "Bikini — teal crystal", 1)).toEqual({
      before: "set ",
      subject: "Bikini — teal crystal",
      after: " to sold out",
    });
    expect(activityParts("moved order 1041 to {s}", "In progress", 1)).toEqual({
      before: "moved order 1041 to ",
      subject: "In progress",
      after: "",
    });
    expect(activityParts("launched the site", "", 1)).toEqual({
      before: "launched the site",
      subject: "",
      after: "",
    });
  });

  test("counts: one photo, three photos", () => {
    expect(activityParts("added {n} photos", "", 1).before).toBe("added a photo");
    expect(activityParts("added {n} photos", "", 3).before).toBe("added 3 photos");
  });

  test("who: first name, the email's name when there's no name, output/input for the platform", () => {
    expect(firstName({ name: "Michelle Oz", email: "michelle@kini.com" })).toBe("Michelle");
    expect(firstName({ name: "", email: "lek.s@ronyen.com" })).toBe("lek.s");
    expect(firstName(null)).toBe("output/input");
    expect(firstName(undefined)).toBe("Someone");
  });
});

describe("when, the way Activity says it", () => {
  const now = new Date("2026-10-17T03:00:00Z"); // 10:00am in Bangkok
  const tz = "Asia/Bangkok";
  test("today, yesterday, then the date; the year only when it isn't this one", () => {
    expect(dayAndTime(new Date("2026-10-17T02:41:00Z"), now, tz)).toBe("Today, 9:41am");
    expect(dayAndTime(new Date("2026-10-16T16:20:00Z"), now, tz)).toBe("Yesterday, 11:20pm");
    expect(dayAndTime(new Date("2026-08-30T03:15:00Z"), now, tz)).toBe("30 Aug, 10:15am");
    expect(dayAndTime(new Date("2025-12-24T03:15:00Z"), now, tz)).toBe("24 Dec 2025, 10:15am");
  });
});
