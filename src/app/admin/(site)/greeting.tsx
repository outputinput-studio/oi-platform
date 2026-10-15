"use client";

import { useSyncExternalStore } from "react";

/**
 * "Morning, Carl." with today's date, worked out on the phone so it's the
 * person's own time of day, not the server's. The server render has no
 * date (it can't know the person's clock); the browser fills it in.
 */
const subscribe = () => () => {};
const useClientNow = () => useSyncExternalStore(subscribe, () => new Date().toDateString() + "|" + new Date().getHours(), () => null);
export function Greeting({ name }: { name: string }) {
  const first = name.split(/[\s@]/)[0] || name;
  const snap = useClientNow();
  const now = snap ? new Date(snap.split("|")[0]) : null;
  const hour = snap ? Number(snap.split("|")[1]) : 12;
  const word = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const date = now
    ? `${now.toLocaleDateString("en-AU", { weekday: "long" })} · ${now.toLocaleDateString("en-AU", { day: "numeric", month: "long" })}`
    : "";
  return (
    <div>
      <p className="label h-4">{date}</p>
      <h2 className="mt-1.5 text-[26px] font-semibold tracking-[-0.5px]">
        {word}, {first}.
      </h2>
    </div>
  );
}
