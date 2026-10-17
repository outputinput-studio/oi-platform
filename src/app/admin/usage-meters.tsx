import { formatBytes, usageLevel, type Plan, type UsageLevel } from "@/modules/plans/plan";
import type { Usage } from "@/modules/plans/server";

/**
 * "What you are using" (design/admin.html, Settings · Plan): each count
 * against the plan's limit, with a bar. Shared by Settings · Plan and ops.
 */
const n = (x: number) => x.toLocaleString("en-AU");

export function usageRows(plan: Plan | null, u: Usage): Array<{ label: string; text: string; level: UsageLevel; pct: number | null }> {
  const l = plan?.limits;
  const row = (label: string, used: number, max: number | null | undefined, usedText: string, maxText: string) => ({
    label,
    text: max == null ? `${usedText}${plan ? " of no limit" : ""}` : `${usedText} of ${maxText}`,
    level: usageLevel(used, max ?? null),
    pct: max == null ? null : Math.min(100, Math.round((used / max) * 100)),
  });
  return [
    row("Photos and files", u.storageBytes, l ? l.storageGb * 1024 ** 3 : null, formatBytes(u.storageBytes), `${l?.storageGb ?? 0} GB`),
    row("Products", u.products, l?.products, n(u.products), n(l?.products ?? 0)),
    row("People who can log in", u.people, l?.people, n(u.people), n(l?.people ?? 0)),
    row("Visits this month", u.visits, l?.visits, n(u.visits), n(l?.visits ?? 0)),
  ];
}

export function UsageMeters({ plan, usage }: { plan: Plan | null; usage: Usage }) {
  const rows = usageRows(plan, usage);
  const close = rows.some((r) => r.level !== "ok");
  return (
    <div>
      <div className="divide-y divide-line-soft rounded-card border border-line bg-surface">
        {rows.map((r) => (
          <div key={r.label} data-testid="usage-row" className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14.5px]">{r.label}</span>
              <span className={`font-mono text-[13px] ${r.level === "ok" ? "text-muted" : "text-warning"}`}>{r.text}</span>
            </div>
            {r.pct !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <div className={`h-full rounded-full ${r.level === "ok" ? "bg-accent" : "bg-warning"}`} style={{ width: `${Math.max(r.pct, 2)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
      {close && <p className="mt-2.5 text-[13px] text-warning">Getting close. Nothing will stop working — we will let you know before it matters.</p>}
    </div>
  );
}
