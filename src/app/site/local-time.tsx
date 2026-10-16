"use client";

import { useSyncExternalStore } from "react";

/**
 * A moment in the shopper's own time zone: "28 August" or "28 August,
 * 9:14am". The server renders the date in UTC until the browser takes over.
 */
export function LocalTime({ iso, withTime = false, short = false }: { iso: string; withTime?: boolean; short?: boolean }) {
  const client = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const d = new Date(iso);
  const month = short ? "short" : "long";
  const text = client
    ? withTime
      ? `${d.toLocaleDateString("en-AU", { day: "numeric", month })}, ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(" ", "").toLowerCase()}`
      : d.toLocaleDateString("en-AU", { day: "numeric", month })
    : d.toLocaleDateString("en-AU", { day: "numeric", month, timeZone: "UTC" });
  return <time dateTime={iso}>{text}</time>;
}
