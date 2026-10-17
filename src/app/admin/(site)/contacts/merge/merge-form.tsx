"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { mergeContactsAction, notSameAction, type FormState } from "@/modules/contacts/actions";
import { Button, Card, Label, Notice } from "../../../ui";
import { Sheet } from "../../../sheet";
import { LocalTime } from "../../local-time";

type Side = {
  id: string;
  name: string;
  email: string;
  phone: string;
  kind: string;
  since: string;
  orders: number;
  enquiries: number;
  notes: number;
};
type Key = "name" | "email" | "phone";

const FIELD_NAMES: Record<Key, string> = { name: "Name", email: "Email", phone: "Phone" };
const PLURAL: Record<string, string> = { order: "orders", enquiry: "enquiries", note: "notes" };
const many = (n: number, one: string) => `${n} ${n === 1 ? one : PLURAL[one]}`;
const counts = (o: number, e: number, n: number) =>
  [o && many(o, "order"), e && many(e, "enquiry"), n && many(n, "note")]
    .filter(Boolean)
    .join(" · ");
const label = (s: Side) => s.name || s.email || s.phone || "Someone";

/**
 * The two side by side (design/admin.html, Merge contacts): pick what to keep
 * where they differ, see what's always kept, then confirm in a sheet.
 */
export function MergeForm({
  a,
  b,
  differ,
  reason,
}: {
  a: Side;
  b: Side;
  differ: Key[];
  reason: string;
}) {
  const [pick, setPick] = useState<Record<Key, "a" | "b">>({ name: "a", email: "a", phone: "a" });
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<FormState>({});
  const [busy, start] = useTransition();
  const kept = counts(a.orders + b.orders, a.enquiries + b.enquiries, a.notes + b.notes);

  return (
    <div data-testid="merge">
      <p className="text-[13.5px] leading-[1.5] text-body">
        {reason ? `${reason} ` : ""}Pick what to keep where they differ. Orders, enquiries and notes
        from both are always kept.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {[a, b].map((s, i) => (
          <Card key={s.id} variant="static" className="min-w-0 px-4 py-3.5">
            <p className="label">{i === 0 ? "Contact one" : "Contact two"}</p>
            <p className="mt-1.5 truncate text-[15px] font-medium text-text">{label(s)}</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted">
              {s.kind} · <LocalTime iso={s.since} style="date" />
              {counts(s.orders, s.enquiries, s.notes)
                ? ` · ${counts(s.orders, s.enquiries, s.notes)}`
                : ""}
            </p>
          </Card>
        ))}
      </div>

      <Label className="mt-7">Where they differ</Label>
      {differ.length === 0 ? (
        <Card variant="static" className="px-4 py-3.5 text-[13.5px] text-muted">
          Nothing: their details match, or one fills the other&apos;s gaps.
        </Card>
      ) : (
        <div className="space-y-5">
          {differ.map((k) => (
            <div key={k} role="radiogroup" aria-label={FIELD_NAMES[k]}>
              <p className="mb-2 text-[13.5px] text-muted">{FIELD_NAMES[k]}</p>
              <div className="space-y-1.5">
                {(["a", "b"] as const).map((side) => {
                  const on = pick[k] === side;
                  const value = (side === "a" ? a : b)[k];
                  return (
                    <button
                      key={side}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPick({ ...pick, [k]: side })}
                      className={`flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left text-[14.5px] ${k === "name" ? "" : "font-mono text-[14px]"} ${on ? "border-accent bg-surface text-text" : "border-line text-body hover:bg-hover"}`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${on ? "border-accent" : "border-line-strong"}`}
                      >
                        {on && <span className="h-2 w-2 rounded-full bg-accent" />}
                      </span>
                      <span className="min-w-0 flex-1 break-all">{value}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Card variant="static" className="mt-6 px-4 py-3.5">
        <p className="label">Always kept</p>
        <p data-testid="always-kept" className="mt-1.5 text-[14px] text-text">
          {kept || "Their details, and anything either of them sends from now on"}
        </p>
      </Card>

      <Notice error={confirm ? undefined : state.error} />
      <Button type="button" className="mt-6 w-full" onClick={() => setConfirm(true)}>
        Merge these two
      </Button>
      {reason ? (
        <Button
          type="button"
          variant="quiet"
          className="mt-2 w-full"
          disabled={busy}
          onClick={() => start(async () => setState(await notSameAction(a.id, b.id)))}
        >
          They are different people
        </Button>
      ) : (
        <Link
          href={`/contacts/${a.id}`}
          className="mt-2 flex h-11 w-full items-center justify-center text-[14.5px] text-muted hover:text-text"
        >
          Cancel
        </Link>
      )}

      {confirm && (
        <Sheet title={`Merge ${label(a)} and ${label(b)}`} onClose={() => setConfirm(false)}>
          <p className="text-[13.5px] leading-[1.55] text-muted">
            They become one contact keeping the values you picked{kept ? `, with all ${kept}` : ""}.
            This cannot be undone.
          </p>
          <Notice error={state.error} />
          <Button
            type="button"
            className="mt-5 w-full"
            disabled={busy}
            onClick={() => start(async () => setState(await mergeContactsAction(a.id, b.id, pick)))}
          >
            {busy ? "Merging…" : "Merge them"}
          </Button>
          <Button
            type="button"
            variant="quiet"
            className="mt-2 w-full"
            onClick={() => setConfirm(false)}
          >
            Go back
          </Button>
        </Sheet>
      )}
    </div>
  );
}
