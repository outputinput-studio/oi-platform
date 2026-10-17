"use client";

import { useSyncExternalStore } from "react";
import { dayAndTime } from "@/lib/time";

/**
 * A moment shown in the reader's own time zone; the server renders a plain date until the browser takes over.
 * "day" reads like Activity: "Today, 9:41am", "30 Aug, 10:15am".
 */
export function LocalTime({ iso, style = "short" }: { iso: string; style?: "short" | "date" | "day" }) {
  const client = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const d = new Date(iso);
  const text = client
    ? style === "date"
      ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : style === "day"
        ? dayAndTime(d)
        : d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return <time dateTime={iso}>{text}</time>;
}
