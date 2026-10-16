"use client";

import { useState } from "react";
import { Button, Input, Label, Notice } from "../ui";
import { DateField, toIso } from "../date-picker";

/**
 * "Publishing", as in design/admin.html: Draft / Live / Scheduled, and
 * for Scheduled a date and a time, in the person's own time zone. The
 * page or article goes live on its own at that moment; nothing needs
 * to run, the clock decides when the site is read.
 */
export type PublishStatus = "draft" | "published" | "scheduled";

export function PublishingCard({
  status,
  scheduledAt,
  onChange,
}: {
  status: PublishStatus;
  /** ISO, when scheduled. */
  scheduledAt?: string | null;
  onChange: (status: PublishStatus, at?: string) => Promise<{ ok?: string; error?: string }>;
}) {
  const [open, setOpen] = useState(status === "scheduled");
  const [picked, setPicked] = useState<PublishStatus>(status);
  const initial = scheduledAt ? new Date(scheduledAt) : defaultTime();
  const [date, setDate] = useState(toIso(initial));
  const [time, setTime] = useState(toTimeInput(initial));
  const [state, setState] = useState<{ ok?: string; error?: string; fields?: string[] }>({});
  const [busy, setBusy] = useState(false);

  const summary =
    status === "published" ? "Live on your site" : status === "scheduled" && scheduledAt ? `Goes live ${fmt(new Date(scheduledAt))}` : "Draft — only you can see it";
  const note = {
    draft: "Nobody else can see it, and it stays out of Google.",
    published: "Anyone can see it now.",
    scheduled: "It appears on its own at the time you set.",
  }[picked];

  const apply = async (next: PublishStatus) => {
    setPicked(next);
    if (next === "scheduled") return; // wait for the time, then Save
    setBusy(true);
    setState(await onChange(next));
    setBusy(false);
  };
  const saveSchedule = async () => {
    const at = new Date(`${date}T${time || "09:00"}`);
    setBusy(true);
    const r = await onChange("scheduled", at.toISOString());
    // Anything wrong here is the time: outline it.
    setState(r.error ? { ...r, fields: ["at"] } : r);
    setBusy(false);
  };

  return (
    <div data-testid="publishing-card" className="rounded-card border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-[15px] text-left hover:bg-hover">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px]">Publishing</span>
          <span data-testid="publish-summary" className="mt-0.5 block text-[12px] text-muted">
            {summary}
          </span>
        </span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`flex-none text-faint ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line-soft px-4 pb-4 pt-4">
          <div>
            <Label>Status</Label>
            <div role="radiogroup" aria-label="Status" className="flex rounded-[6px] border border-line bg-bg p-[3px]">
              {(
                [
                  ["draft", "Draft"],
                  ["published", "Live"],
                  ["scheduled", "Scheduled"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={picked === v}
                  disabled={busy}
                  onClick={() => void apply(v)}
                  className={`h-10 flex-1 rounded-button text-[14px] ${picked === v ? "bg-accent text-text" : "text-muted hover:text-text"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">{note}</p>
          </div>
          {picked === "scheduled" && (
            <div>
              <Label>Publish on</Label>
              <div data-field="at" className="grid grid-cols-[1fr_150px] gap-2">
                <DateField label="Date" value={date} min={toIso(new Date())} onChange={setDate} />
                <Input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted">This is also the date shown on it. Your own time zone.</p>
              <Button type="button" size="sm" className="mt-3" disabled={busy} onClick={() => void saveSchedule()}>
                {busy ? "Saving…" : status === "scheduled" ? "Change the time" : "Schedule it"}
              </Button>
            </div>
          )}
          <Notice {...state} />
        </div>
      )}
    </div>
  );
}

function defaultTime(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toTimeInput(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmt(d: Date) {
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
