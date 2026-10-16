"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveDetailRowsAction, type SettingsFormState } from "@/modules/sites/actions";
import { DETAIL_SUGGESTIONS } from "@/modules/products/details";
import type { DetailRow } from "@/modules/sites/shop";
import { Button, Input, Notice, Textarea } from "../../../ui";
import { SortableItem, SortableList } from "../../../sortable";

const id = () => Math.random().toString(36).slice(2, 10);

/**
 * The rows, in the order they open up on a product page: drag to reorder,
 * write each once. A product can change or hide any row for itself;
 * changing one here updates every product still using it as it is.
 */
export function DetailRowsEditor({
  initial,
  usage,
  deliveryPreview,
  canEdit,
}: {
  initial: DetailRow[];
  usage: { total: number; rows: Record<string, { custom: number; hidden: number }> };
  deliveryPreview: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(rows) !== saved;
  const set = (rid: string, patch: Partial<DetailRow>) => setRows((cur) => cur.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const add = (kind: DetailRow["kind"], title: string) => setRows((cur) => [...cur, { id: id(), kind, title, text: "" }]);
  const suggestions = DETAIL_SUGGESTIONS.filter((s) => !rows.some((r) => r.title.toLowerCase() === s.title.toLowerCase() || (s.kind === "delivery" && r.kind === "delivery")));

  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveDetailRowsAction(rows).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(JSON.stringify(rows));
    });

  const usageLine = (r: DetailRow) => {
    const u = usage.rows[r.id] ?? { custom: 0, hidden: 0 };
    const as = usage.total - u.custom - u.hidden;
    return [`${as} product${as === 1 ? "" : "s"} as written`, u.custom ? `${u.custom} changed` : "", u.hidden ? `${u.hidden} hidden` : ""].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-5">
      <p className="text-[14px] leading-[1.55] text-body">
        The rows that open up on every product page. Write them once here and each product uses them. You can change or hide any row on a single product without touching these.
      </p>
      {rows.length === 0 && <p className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13.5px] text-muted">No rows yet. Start with one of these, or add your own.</p>}
      <ul className="space-y-2">
        <SortableList ids={rows.map((r) => r.id)} onReorder={(order) => setRows(order.map((k) => rows.find((r) => r.id === k)!).filter(Boolean))}>
          {rows.map((r, i) => (
            <SortableItem key={r.id} id={r.id}>
              {({ handle }) => (
                <li data-testid={`detail-row-${i}`} className="rounded-card border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <button type="button" {...handle} aria-label={`Move ${r.title || "row"}`} className="flex h-10 w-8 flex-none cursor-grab touch-none items-center justify-center rounded-button text-faint hover:bg-hover hover:text-text active:cursor-grabbing">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                          <path d="M5 9h14M5 15h14" />
                        </svg>
                      </button>
                    )}
                    <Input aria-label={`Row ${i + 1} title`} data-field={`rows.${i}.title`} value={r.title} maxLength={60} readOnly={!canEdit} placeholder="Title" className="!h-10 min-w-0 flex-1 font-medium" onChange={(e) => set(r.id, { title: e.target.value })} />
                    {canEdit && (
                      <button type="button" aria-label={`Remove ${r.title || "row"}`} onClick={() => setRows((cur) => cur.filter((x) => x.id !== r.id))} className="flex h-10 w-10 flex-none items-center justify-center rounded-button text-muted hover:bg-hover hover:text-alert">
                        ×
                      </button>
                    )}
                  </div>
                  <div className="mt-2 pl-0 md:pl-10">
                    {r.kind === "delivery" ? (
                      <div className="rounded-card bg-sunken px-3 py-2.5">
                        <p className="text-[12.5px] text-muted">
                          Written from{" "}
                          <Link href="/settings/shipping" className="underline underline-offset-2">
                            Shipping
                          </Link>{" "}
                          — dispatch time and your rates. Nothing to write. Right now it reads:
                        </p>
                        <p className="mt-1.5 whitespace-pre-line text-[13px] text-body">{deliveryPreview}</p>
                      </div>
                    ) : (
                      <Textarea aria-label={`Row ${i + 1} text`} data-field={`rows.${i}.text`} value={r.text} rows={3} maxLength={2000} readOnly={!canEdit} placeholder="What every product says here. Leave an empty line between paragraphs." onChange={(e) => set(r.id, { text: e.target.value })} />
                    )}
                    <p className="mt-1.5 text-[12px] text-muted">{usageLine(r)}</p>
                  </div>
                </li>
              )}
            </SortableItem>
          ))}
        </SortableList>
      </ul>
      {canEdit && rows.length < 12 && (
        <div className="space-y-2">
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button key={s.title} type="button" variant="quiet" size="sm" onClick={() => add(s.kind, s.title)}>
                  + {s.title}
                </Button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => add("text", "")} className="flex h-12 w-full items-center justify-center rounded-card border border-dashed border-accent text-[14.5px] text-text hover:bg-hover">
            + Add a row
          </button>
          <p className="text-[12.5px] text-muted">Drag to set the order they appear in. Changing a row here updates every product still using it as written.</p>
        </div>
      )}
      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save rows" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change these.</p>
      )}
    </div>
  );
}
