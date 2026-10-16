"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDetails } from "@/modules/products/details";
import type { DetailRow } from "@/modules/sites/shop";
import { Button, Chevron, Textarea } from "../../../ui";

/**
 * Product details on one product, as in design/admin.html: each of the
 * site's rows used as written, changed here, or hidden here. Folded until
 * opened; the line under the title says how many are changed.
 */
export function DetailRows({
  rows,
  value,
  delivery,
  onChange,
  errorFields,
}: {
  rows: DetailRow[];
  value: ProductDetails;
  delivery: string;
  onChange: (next: ProductDetails) => void;
  /** The fields a failed save named: a problem in a row opens the card so it can be shown. */
  errorFields?: string[];
}) {
  const faulty = Boolean(errorFields?.some((f) => f.startsWith("details")));
  const [open, setOpen] = useState(false);
  // Opened for a problem, it stays open once fixed (no folding away mid-edit).
  if (faulty && !open) setOpen(true);
  const changed = rows.filter((r) => value[r.id]).length;
  const set = (rid: string, o: ProductDetails[string] | null) => {
    const next = { ...value };
    if (o) next[rid] = o;
    else delete next[rid];
    onChange(next);
  };
  return (
    <section data-testid="product-detail-rows" data-field="details" className="rounded-card border border-line bg-surface">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Product details</span>
          <span className="block truncate text-[12.5px] text-muted">
            {rows.length ? `${rows.map((r) => r.title).join(", ")}${changed ? ` · ${changed} changed here` : ""}` : "No rows yet"}
          </span>
        </span>
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>
          <Chevron />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line-soft p-4">
          {rows.length === 0 && (
            <p className="text-[13.5px] text-muted">
              Rows like Materials, Care and Delivery are written once in{" "}
              <Link href="/settings/product-details" className="underline underline-offset-2">
                Settings · Product details
              </Link>
              , then show on every product.
            </p>
          )}
          {rows.map((r) => {
            const o = value[r.id];
            const asWritten = r.kind === "delivery" ? delivery : r.text;
            return (
              <div key={r.id} data-testid={`product-detail-${r.title}`} data-field={`details.${r.id}`} className="rounded-card bg-sunken p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14.5px] font-medium">{r.title}</span>
                  <span className="text-[12px] text-muted">{o?.mode === "hidden" ? "Hidden on this product" : o?.mode === "custom" ? "Changed here" : "As written for every product"}</span>
                </div>
                {o?.mode === "custom" ? (
                  <Textarea aria-label={`${r.title} on this product`} data-field={`details.${r.id}.text`} className="mt-2" rows={3} maxLength={2000} value={o.text} onChange={(e) => set(r.id, { mode: "custom", text: e.target.value })} />
                ) : (
                  <p className={`mt-1.5 whitespace-pre-line text-[13px] ${o?.mode === "hidden" ? "text-faint line-through" : "text-body"}`}>{asWritten || <span className="text-faint">Nothing written yet.</span>}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!o && (
                    <>
                      <Button type="button" variant="quiet" size="sm" onClick={() => set(r.id, { mode: "custom", text: asWritten })}>
                        Change for this product
                      </Button>
                      <Button type="button" variant="quiet" size="sm" onClick={() => set(r.id, { mode: "hidden" })}>
                        Hide here
                      </Button>
                    </>
                  )}
                  {o?.mode === "custom" && (
                    <Button type="button" variant="quiet" size="sm" onClick={() => set(r.id, null)}>
                      Back to what every product says
                    </Button>
                  )}
                  {o?.mode === "hidden" && (
                    <Button type="button" variant="quiet" size="sm" onClick={() => set(r.id, null)}>
                      Show it again
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
