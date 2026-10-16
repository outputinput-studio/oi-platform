"use client";

import { useState } from "react";
import { Sheet } from "../../../ui";

/** "3 people waiting", as in design/admin.html: who asked to hear when this is back, in a sheet. */
export function WaitingList({ waiting }: { waiting: { email: string; variant: string; createdAt: string }[] }) {
  const [open, setOpen] = useState(false);
  if (waiting.length === 0) return null;
  const n = waiting.length;
  return (
    <>
      <button type="button" data-testid="waiting-count" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left hover:bg-hover">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium">
            {n} {n === 1 ? "person" : "people"} waiting
          </span>
          <span className="block text-[12.5px] text-muted">They asked to hear when this is back.</span>
        </span>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </button>
      {open && (
        <Sheet title="Waiting on this piece" onClose={() => setOpen(false)}>
          <p className="-mt-2 mb-4 text-[13px] leading-[1.5] text-muted">They get one email when you set this back to for sale. Nothing goes out before that.</p>
          <ul className="divide-y divide-line-soft rounded-card border border-line bg-surface">
            {waiting.map((w) => (
              <li key={`${w.email}~${w.variant}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{w.email}</span>
                  {w.variant && <span className="block text-[12.5px] text-muted">{w.variant.split(" / ").join(" · ")}</span>}
                </span>
                <span className="flex-none font-mono text-[12px] text-muted">{ago(w.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/** "2d", "5h", "now". */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return mins < 1 ? "now" : `${mins}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}
