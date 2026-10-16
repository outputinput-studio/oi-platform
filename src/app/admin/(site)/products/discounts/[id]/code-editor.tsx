"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCodeAction, saveCodeAction } from "@/modules/products/actions";
import { DISCOUNT_KINDS, DISCOUNT_SCOPES } from "@/modules/discounts/kinds";
import { formatPrice, parsePrice, priceInput, type Currency } from "@/modules/sites/shop";
import { Button, Field, Input, Label, Notice, Switch } from "../../../../ui";
import { DateField } from "../../../../date-picker";

type Kind = (typeof DISCOUNT_KINDS)[number];
type Scope = (typeof DISCOUNT_SCOPES)[number];
type Draft = {
  code: string;
  kind: Kind;
  value: number;
  appliesTo: Scope;
  categoryId: string | null;
  productIds: string[];
  minSpend: number | null;
  maxUses: number | null;
  perPerson: number | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

const KIND: Record<Kind, string> = { percent: "Percentage off", amount: "Amount off", freeShipping: "Free postage" };
const SCOPE: Record<Scope, [string, string]> = { all: ["Everything", "Every product on your site."], category: ["One category", "Bikinis, costumes, and so on."], products: ["Products you pick", "Choose them one by one."] };

/** A discount code, as in design/admin.html: the code, what it takes off, what it's for, limits, dates, and a preview. */
export function CodeEditor({
  codeId,
  initial,
  categories,
  products,
  currency,
}: {
  codeId?: string;
  initial: Draft | null;
  categories: { id: string; name: string; count: number }[];
  products: { id: string; name: string }[];
  currency: Currency;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial ?? { code: "", kind: "percent", value: 10, appliesTo: "all", categoryId: null, productIds: [], minSpend: null, maxUses: null, perPerson: null, startsAt: "", endsAt: "", active: true });
  const [amount, setAmount] = useState(d.kind === "amount" ? priceInput(d.value) : "");
  const [min, setMin] = useState(priceInput(d.minSpend));
  const [state, setState] = useState<{ ok?: string; error?: string; fields?: string[] }>({});
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const fmt = (c: number) => formatPrice(c, currency);

  const sample = 42000;
  const off = d.kind === "percent" ? Math.round((sample * d.value) / 100) : d.kind === "amount" ? Math.min(sample, d.value) : 0;

  const save = () =>
    start(async () => {
      let value = d.value;
      let minSpend = d.minSpend;
      let at = "value";
      try {
        if (d.kind === "amount") value = parsePrice(amount) ?? 0;
        at = "minSpend";
        minSpend = parsePrice(min);
      } catch (e) {
        return setState({ error: e instanceof Error ? e.message : "Check the amounts.", fields: [at] });
      }
      const r = await saveCodeAction(codeId, { ...d, value, minSpend, startsAt: d.startsAt || null, endsAt: d.endsAt || null }).catch(() => ({ error: "couldn't reach the server", id: undefined }));
      setState(r);
      if (!r.error && !codeId && r.id) router.replace(`/products/discounts/${r.id}`);
    });

  return (
    <div className="space-y-6">
      <Field label="Code" htmlFor="code-text" hint="What the customer types at the checkout. Capitals either way.">
        <div className="flex gap-2">
          <Input id="code-text" data-field="code" value={d.code} maxLength={30} className="font-mono uppercase" onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })} />
          <Button type="button" variant="quiet" onClick={() => set({ code: Math.random().toString(36).slice(2, 10).toUpperCase() })}>
            Generate one
          </Button>
        </div>
      </Field>

      <div>
        <Label>Discount</Label>
        <div role="radiogroup" aria-label="Discount" className="flex rounded-[6px] border border-line bg-bg p-[3px]">
          {DISCOUNT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={d.kind === k} onClick={() => set({ kind: k, value: k === "percent" ? 10 : k === "amount" ? (parsePrice(amount || "0") ?? 0) : 0 })} className={`h-10 flex-1 rounded-button text-[13.5px] ${d.kind === k ? "bg-accent text-text" : "text-muted hover:text-text"}`}>
              {KIND[k]}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {d.kind === "percent" && (
            <Field label="Percent off" htmlFor="code-pct">
              <Input id="code-pct" data-field="value" inputMode="numeric" className="max-w-[120px] font-mono" value={String(d.value)} onChange={(e) => set({ value: Math.min(100, Number(e.target.value.replace(/\D/g, "") || 0)) })} />
            </Field>
          )}
          {d.kind === "amount" && (
            <Field label="Amount off" htmlFor="code-amt" hint={`In ${currency}.`}>
              <Input id="code-amt" data-field="value" inputMode="decimal" className="max-w-[160px] font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          {d.kind === "freeShipping" && <p className="text-[12.5px] text-muted">Postage comes off the total. The products stay full price.</p>}
        </div>
      </div>

      {d.kind !== "freeShipping" && (
        <fieldset>
          <legend className="mb-1.5 text-[13.5px] text-body">Applies to</legend>
          <div role="radiogroup" aria-label="Applies to" className="space-y-2">
            {DISCOUNT_SCOPES.map((sc) => (
              <button key={sc} type="button" role="radio" aria-checked={d.appliesTo === sc} onClick={() => set({ appliesTo: sc })} className={`flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left ${d.appliesTo === sc ? "border-accent bg-selected" : "border-line bg-surface hover:bg-hover"}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px]">{SCOPE[sc][0]}</span>
                  <span className="block text-[12.5px] text-muted">{SCOPE[sc][1]}</span>
                </span>
              </button>
            ))}
          </div>
          {d.appliesTo === "category" && (
            <div data-field="categoryId" className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.id} type="button" aria-pressed={d.categoryId === c.id} onClick={() => set({ categoryId: c.id })} className={`rounded-full border px-3 py-1.5 text-[13px] ${d.categoryId === c.id ? "border-text bg-text text-bg" : "border-line text-body hover:bg-hover"}`}>
                  {c.name} · {c.count}
                </button>
              ))}
              {categories.length === 0 && <p className="text-[12.5px] text-muted">No categories yet.</p>}
            </div>
          )}
          {d.appliesTo === "products" && (
            <div data-field="productIds" className="mt-3 flex max-h-[220px] flex-wrap gap-2 overflow-y-auto">
              {products.map((p) => {
                const on = d.productIds.includes(p.id);
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ productIds: on ? d.productIds.filter((x) => x !== p.id) : [...d.productIds, p.id] })} className={`rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-text bg-text text-bg" : "border-line text-body hover:bg-hover"}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <Field label="Minimum spend" htmlFor="code-min" hint="Before postage. Leave empty for no minimum.">
        <Input id="code-min" data-field="minSpend" inputMode="decimal" className="max-w-[160px] font-mono" value={min} onChange={(e) => setMin(e.target.value)} />
      </Field>

      <div>
        <p className="mb-1.5 text-[13.5px] text-body">How many times it can be used</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="In total" htmlFor="code-max">
            <Input id="code-max" data-field="maxUses" inputMode="numeric" className="font-mono" value={d.maxUses ?? ""} onChange={(e) => set({ maxUses: e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null })} />
          </Field>
          <Field label="Per person" htmlFor="code-per">
            <Input id="code-per" data-field="perPerson" inputMode="numeric" className="font-mono" value={d.perPerson ?? ""} onChange={(e) => set({ perPerson: e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null })} />
          </Field>
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">Leave either empty and there is no limit on it.</p>
      </div>

      <div>
        <p className="mb-1.5 text-[13.5px] text-body">When it runs</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="code-start">
            <div data-field="startsAt">
              <DateField id="code-start" value={d.startsAt} onChange={(v) => set({ startsAt: v })} />
            </div>
          </Field>
          <Field label="Ends" htmlFor="code-end">
            <div data-field="endsAt">
              <DateField id="code-end" value={d.endsAt} onChange={(v) => set({ endsAt: v })} />
            </div>
          </Field>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <Switch checked={d.active} onChange={(active) => set({ active })} label="Active" hint="Turn off to stop it working without deleting it." />
      </div>

      <div>
        <Label>What customers see</Label>
        <dl className="space-y-1.5 rounded-card border border-line bg-sunken p-4 font-mono text-[13.5px]">
          <div className="flex justify-between">
            <dt>Products</dt>
            <dd>{fmt(sample)}</dd>
          </div>
          {d.kind !== "freeShipping" && (
            <div className="flex justify-between">
              <dt>{d.code || "CODE"}</dt>
              <dd>−{fmt(d.kind === "amount" ? Math.min(sample, (() => { try { return parsePrice(amount) ?? 0; } catch { return 0; } })()) : off)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Postage</dt>
            <dd>{d.kind === "freeShipping" ? "Free" : "As usual"}</dd>
          </div>
        </dl>
      </div>

      <Notice {...state} />
      <Button type="button" className="w-full" disabled={pending} onClick={save}>
        {pending ? "Saving…" : "Save code"}
      </Button>
      {codeId && (
        <form action={deleteCodeAction}>
          <input type="hidden" name="codeId" value={codeId} />
          <Button type="submit" variant="danger" size="sm">
            Delete this code
          </Button>
        </form>
      )}
    </div>
  );
}
