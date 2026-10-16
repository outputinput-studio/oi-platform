import type { Timeline } from "@/modules/customers/timeline";
import { LocalTime } from "./local-time";

/**
 * Where an order is (design/storefront-accounts.html, Tracking result):
 * the headline, the steps with when each happened, and the parcel's
 * tracking number with a link to the carrier. Shared by Track my order and
 * the account's order page.
 */
export function TimelineView({ number, placedAt, timeline, children }: { number: number; placedAt: string; timeline: Timeline; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">
          Order {number} · <LocalTime iso={placedAt} />
        </p>
        <h2 data-testid="order-headline" className="mt-1.5 text-[26px] font-semibold leading-tight">
          {timeline.headline}
        </h2>
      </div>
      {children}
      <ol data-testid="order-steps" className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        {timeline.steps.map((s, i) => {
          const last = i === timeline.steps.length - 1;
          const nextDone = !last && timeline.steps[i + 1].done;
          return (
            <li key={s.key} data-done={s.done || undefined} className="relative flex gap-3.5 pb-4 last:pb-0">
              {!last && <span aria-hidden className={`absolute left-[5px] top-3 h-full w-px ${nextDone ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />}
              <span aria-hidden className={`relative mt-[5px] h-[11px] w-[11px] flex-none rounded-full border ${s.done ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--text-muted)] bg-[var(--bg)]"}`} />
              <div className="min-w-0">
                <p className={`text-[15px] ${s.done ? "" : "text-[var(--text-muted)]"}`}>
                  {s.label}
                  <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
                </p>
                {(s.at || s.detail) && (
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">
                    {s.at && s.done && <LocalTime iso={s.at} withTime={s.key === "new"} />}
                    {s.at && s.done && s.detail ? " · " : ""}
                    {s.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {timeline.tracking && (
        <div data-testid="order-tracking" className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <p className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">Tracking</p>
          {timeline.tracking.carrier && <p className="mt-1.5 text-[14px]">{timeline.tracking.carrier}</p>}
          <p className="mt-0.5 font-mono text-[15px]">{timeline.tracking.number}</p>
          {timeline.tracking.url && (
            <a href={timeline.tracking.url} target="_blank" rel="noopener noreferrer" className="mt-3 flex h-11 items-center justify-center rounded-[6px] border border-[var(--border)] text-[14.5px] hover:border-[var(--text-muted)]">
              Track with {timeline.tracking.carrier || "the carrier"}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
