"use client";

import { useState } from "react";
import { AddressForm, type AddressValues } from "./account-forms";
import { secondaryClass } from "./account-styles";

type Row = AddressValues & { id: string; isDefault: boolean; lines: string[] };

/**
 * Addresses (design/storefront-accounts.html): each one with Default or
 * Make default, Edit and Delete; Add an address at the foot. One form open
 * at a time, in place.
 */
export function AddressList({ addresses, countries, defaults, action }: { addresses: Row[]; countries: { code: string; name: string }[]; defaults: AddressValues; action: (form: FormData) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(addresses.length === 0 ? "new" : null);
  return (
    <div className="space-y-3">
      {addresses.map((a) =>
        open === a.id ? (
          <div key={a.id} className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <AddressForm initial={a} countries={countries} onSaved={() => setOpen(null)} onCancel={() => setOpen(null)} />
          </div>
        ) : (
          <div key={a.id} data-testid="address-card" className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px]">
                {a.name}
                {a.label && <span className="text-[var(--text-muted)]"> · {a.label}</span>}
              </p>
              {a.isDefault && <span className="flex-none rounded-[4px] border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[1px] text-[var(--text-muted)]">Default</span>}
            </div>
            <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[var(--text-body)]">{a.lines.join("\n")}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
              {!a.isDefault && (
                <form action={action}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="intent" value="default" />
                  <button type="submit" className="underline underline-offset-4">
                    Make default
                  </button>
                </form>
              )}
              <button type="button" onClick={() => setOpen(a.id)} className="underline underline-offset-4">
                Edit
              </button>
              <form action={action}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="intent" value="delete" />
                <button type="submit" className="text-[var(--text-muted)] underline underline-offset-4">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ),
      )}
      {open === "new" ? (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <AddressForm initial={defaults} countries={countries} onSaved={() => setOpen(null)} onCancel={addresses.length ? () => setOpen(null) : undefined} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen("new")} className={secondaryClass}>
          Add an address
        </button>
      )}
    </div>
  );
}
