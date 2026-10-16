"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui";

const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * A date field: type it (dd/mm/yyyy, the way Australians write it, or
 * yyyy-mm-dd) or tap the calendar and pick. The value in and out is
 * always yyyy-mm-dd, the same as a native date input, so nothing that
 * used one has to change. The calendar is a modal on the tokens, weeks
 * starting Monday, today ringed, the chosen day filled with the accent.
 */
export function DateField({
  value,
  onChange,
  min,
  id,
  label,
  className = "",
}: {
  value: string; // yyyy-mm-dd or ""
  onChange: (v: string) => void;
  /** yyyy-mm-dd; days before it can't be picked. */
  min?: string;
  id?: string;
  /** Accessible name for the input when there's no <label htmlFor>. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(toDisplay(value));
  // The value changed from outside (picked in the calendar, or a reload): show it.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setTyped(toDisplay(value));
  }

  const commit = () => {
    const iso = parseTyped(typed);
    if (iso) {
      setTyped(toDisplay(iso));
      if (iso !== value) onChange(iso);
    } else if (typed.trim() === "") {
      if (value) onChange("");
    } else setTyped(toDisplay(value)); // couldn't read it: put back what we had
  };

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="block h-11 w-full rounded-button border border-control bg-transparent pl-3.5 pr-11 font-mono text-[14px] text-text outline-none placeholder:text-faint focus:border-accent"
      />
      <button
        type="button"
        aria-label="Pick a date"
        onClick={() => setOpen(true)}
        className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text"
      >
        <CalendarIcon />
      </button>
      {open && (
        <Calendar
          value={value}
          min={min}
          onPick={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Calendar({ value, min, onPick, onClose }: { value: string; min?: string; onPick: (iso: string) => void; onClose: () => void }) {
  const mounted = useMounted();
  const today = toIso(new Date());
  const start = value || today;
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1); // 0-based
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const move = (by: number) => {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="calendar"
        className="w-full max-w-[340px] rounded-card border border-line bg-panel p-4 shadow-[0_24px_60px_-12px_var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text">
            <Arrow dir="left" />
          </button>
          <h2 id={titleId} className="text-[15px] font-medium">
            {MONTHS[month]} {year}
          </h2>
          <button type="button" aria-label="Next month" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text">
            <Arrow dir="right" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {DAYS.map((d) => (
            <div key={d} className="label py-1 text-center">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
            const disabled = !!min && iso < min;
            const chosen = iso === value;
            const isToday = iso === today;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                aria-label={longDate(iso)}
                aria-pressed={chosen}
                onClick={() => onPick(iso)}
                className={`mx-auto flex h-9 w-9 items-center justify-center rounded-button font-mono text-[13.5px] ${
                  chosen ? "bg-accent text-text" : disabled ? "text-faint/60 cursor-default" : "text-body hover:bg-hover hover:text-text"
                } ${isToday && !chosen ? "ring-1 ring-inset ring-control" : ""}`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
          <Button type="button" variant="quiet" size="sm" onClick={() => onPick(today)} disabled={!!min && today < min}>
            Today
          </Button>
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────── dates as text ─────────────────────────

function pad(n: number) {
  return String(n).padStart(2, "0");
}
export function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** yyyy-mm-dd → dd/mm/yyyy for the field; "" stays "". */
function toDisplay(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
/** What someone typed → yyyy-mm-dd, or null if it isn't a real date. Accepts 5/3/2026, 05-03-2026, 2026-03-05. */
function parseTyped(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toIso(date);
}
function longDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}
function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}
