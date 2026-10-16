"use client";

import { useState } from "react";
import type { ProductMake } from "@/modules/products/kinds";
import { MAX_OPTIONS, optionsSchema, unitPrice, variantKey, variantLabel, variantsFor, variantState, type ProductOption, type Variant } from "@/modules/products/options";
import { formatPrice, parsePrice, priceInput, type Currency } from "@/modules/sites/shop";
import { Button, Field, Input, Notice, Segmented, Sheet, Switch } from "../../../ui";

const newId = () => Math.random().toString(36).slice(2, 10);
/** "6, 8, 10" → ["6", "8", "10"]: trimmed, no blanks. Repeats stay, so the check can say so. */
const splitValues = (text: string) =>
  text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

type Product = { make: ProductMake; leadTime: number | null; leadUnit: "weeks" | "days"; price: number | null; salePrice: number | null };

/**
 * Options on a product, as in design/admin.html: "This product has
 * options", then up to two — a list to choose from (each mix of values a
 * combination with its own price, code and stock) or a box the customer
 * fills in. Options save as you go once they make sense; until then each
 * says what's missing. A combination opens in a sheet and saves on its own.
 */
export function OptionsEditor({
  options,
  variants,
  product,
  currency,
  onOptions,
  onVariant,
}: {
  options: ProductOption[];
  /** The stored combination settings. */
  variants: Variant[];
  product: Product;
  currency: Currency;
  /** A whole, valid set of options: saved by the editor's autosave. */
  onOptions: (next: ProductOption[]) => void;
  /** One combination's sheet, saved straight away. */
  onVariant: (v: Variant) => Promise<{ error?: string; fields?: string[] }>;
}) {
  // What's typed, kept apart from what's saved, so "6, 8," can be half-written without losing anything.
  const [drafts, setDrafts] = useState(() => options.map((o) => ({ ...o, text: o.values.join(", ") })));
  const [on, setOn] = useState(options.length > 0);
  const [editing, setEditing] = useState<Variant | null>(null);
  /** Fields typed in: a problem shows under one only once it's been touched, not the moment an option is added. */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const touch = (key: string) => setTouched((cur) => (cur.has(key) ? cur : new Set(cur).add(key)));
  const fmt = (c: number) => formatPrice(c, currency);

  const parsed = drafts.map(({ text, ...o }) => ({ ...o, values: splitValues(text) }));
  const check = optionsSchema.safeParse(parsed);
  /** The problems with what's typed, by path ("0.values"), shown under each field until fixed. */
  const problems = new Map<string, string>();
  if (!check.success) for (const i of check.error.issues) if (!problems.has(i.path.join("."))) problems.set(i.path.join("."), i.message);

  const update = (next: typeof drafts) => {
    setDrafts(next);
    const r = optionsSchema.safeParse(next.map(({ text, ...o }) => ({ ...o, values: splitValues(text) })));
    if (r.success) onOptions(r.data);
  };
  const set = (i: number, patch: Partial<(typeof drafts)[number]>) => update(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () => update([...drafts, { id: newId(), name: drafts.length === 0 ? "Size" : "Colour", kind: "list", values: [], text: "", answer: "text", help: "", required: true }]);

  const combos = check.success ? variantsFor(check.data, variants, product.make) : [];

  return (
    <section data-testid="product-options" data-field="options" className="rounded-card border border-line bg-surface">
      <div className="p-4">
        <Switch
          checked={on}
          onChange={(v) => {
            setOn(v);
            if (!v) {
              setDrafts([]);
              onOptions([]);
            } else if (drafts.length === 0) add();
          }}
          label="This product has options"
          hint="Sizes, colours — each one can have its own price and stock."
        />
      </div>
      {on && (
        <div className="space-y-4 border-t border-line-soft p-4">
          {drafts.map((o, i) => {
            const why = (k: string) => (touched.has(`${o.id}.${k}`) ? problems.get(`${i}.${k}`) : undefined);
            return (
              <div key={o.id} data-testid={`option-${i}`} className="space-y-3 rounded-card border border-line-soft bg-sunken p-3">
                <div className="flex items-center justify-between">
                  <span className="label">Option {i + 1}</span>
                  <button type="button" onClick={() => update(drafts.filter((_, j) => j !== i))} className="text-[13px] text-muted hover:text-alert">
                    Remove
                  </button>
                </div>
                <Segmented
                  label={`Option ${i + 1} kind`}
                  value={o.kind}
                  options={[
                    ["list", "Choose from a list"],
                    ["fill", "Customer fills in"],
                  ]}
                  onChange={(kind) => set(i, { kind: kind as ProductOption["kind"] })}
                />
                <p className="text-[12.5px] text-muted">{o.kind === "list" ? "Values you stock, each with its own price and stock." : "A box on the product page they fill in themselves. Made to their measurements."}</p>
                <Field label={o.kind === "list" ? "Name" : "What you ask for"} htmlFor={`opt-${o.id}-name`}>
                  <Input id={`opt-${o.id}-name`} data-field={`options.${i}.name`} aria-invalid={Boolean(why("name")) || undefined} value={o.name} maxLength={40} placeholder={o.kind === "list" ? "Size" : "Your measurement"} onChange={(e) => {
                      touch(`${o.id}.name`);
                      set(i, { name: e.target.value });
                    }} />
                </Field>
                {why("name") && <p className="-mt-2 text-[12.5px] text-alert">{why("name")}</p>}
                {o.kind === "fill" && (
                  <>
                    <div>
                      <p className="mb-1.5 text-[13.5px] text-body">Kind of answer</p>
                      <Segmented
                        label={`Option ${i + 1} answer`}
                        value={o.answer}
                        options={[
                          ["text", "Short text"],
                          ["number", "Number"],
                          ["choice", "Choose one"],
                        ]}
                        onChange={(answer) => set(i, { answer: answer as ProductOption["answer"] })}
                      />
                    </div>
                    <Field label="Help text on the product page" htmlFor={`opt-${o.id}-help`}>
                      <Input id={`opt-${o.id}-help`} data-field={`options.${i}.help`} value={o.help} maxLength={200} placeholder="Your dress size, or your bust measurement in cm" onChange={(e) => set(i, { help: e.target.value })} />
                    </Field>
                    <Switch checked={o.required} onChange={(required) => set(i, { required })} label="They must fill it in" />
                  </>
                )}
                {(o.kind === "list" || o.answer === "choice") && (
                  <Field label={o.kind === "list" ? "Values" : "Choices"} htmlFor={`opt-${o.id}-values`} hint="Separated by commas.">
                    <Input id={`opt-${o.id}-values`} data-field={`options.${i}.values`} aria-invalid={Boolean(why("values")) || undefined} value={o.text} placeholder={o.kind === "list" ? "6, 8, 10" : "Short, Regular, Long"} onChange={(e) => {
                      touch(`${o.id}.values`);
                      set(i, { text: e.target.value });
                    }} />
                  </Field>
                )}
                {why("values") && <p className="-mt-2 text-[12.5px] text-alert">{why("values")}</p>}
                {o.kind === "fill" && o.name.trim() && (
                  <p className="text-[12.5px] text-muted">
                    On the order it reads: <span className="text-text">{o.name.trim()} — {o.answer === "number" ? "10" : o.answer === "choice" ? (splitValues(o.text)[0] ?? "…") : "what they type"}</span>. No stock and no price change.
                  </p>
                )}
              </div>
            );
          })}
          {problems.get("") && <p className="text-[12.5px] text-alert">{problems.get("")}</p>}
          {drafts.length < MAX_OPTIONS && (
            <Button type="button" variant="quiet" size="sm" onClick={add}>
              + Add an option
            </Button>
          )}
          <p className="text-[12.5px] text-muted">Two options is the limit. Stock and availability sit on each combination, not the product.</p>

          {combos.length > 0 && (
            <div>
              <p className="mb-1.5 text-[13.5px] text-body">
                {combos.length} combination{combos.length === 1 ? "" : "s"}
              </p>
              <ul className="divide-y divide-line-soft rounded-card border border-line bg-bg">
                {combos.map((v) => {
                  const unit = unitPrice(product, v);
                  const off = variantState(v) === "off";
                  return (
                    <li key={variantKey(v.values)}>
                      <button type="button" data-testid={`combo-${variantLabel(v.values)}`} onClick={() => setEditing(v)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[14.5px] ${off ? "text-muted line-through" : ""}`}>{variantLabel(v.values)}</span>
                          <span className="block truncate text-[12.5px] text-muted">
                            {unit === null ? "No price" : fmt(unit)} · {comboState(v)}
                          </span>
                        </span>
                        <span aria-hidden className="text-muted">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[12.5px] text-muted">Tap a combination to set its price, code and stock.</p>
            </div>
          )}
        </div>
      )}
      {editing && <VariantSheet v={editing} product={product} currency={currency} onClose={() => setEditing(null)} onSave={onVariant} />}
    </section>
  );
}

/** One combination: whether it's offered, its price and code, how it's made and how many there are. */
function VariantSheet({ v, product, currency, onClose, onSave }: { v: Variant; product: Product; currency: Currency; onClose: () => void; onSave: (v: Variant) => Promise<{ error?: string; fields?: string[] }> }) {
  const [d, setD] = useState(v);
  const [price, setPrice] = useState(priceInput(v.price));
  const [state, setState] = useState<{ error?: string; fields?: string[] }>({});
  const [saving, setSaving] = useState(false);
  const inherited = unitPrice(product, null);

  const save = async () => {
    let cents: number | null;
    try {
      cents = parsePrice(price);
    } catch (e) {
      return setState({ error: e instanceof Error ? e.message : "That isn't a price.", fields: ["price"] });
    }
    setSaving(true);
    const r = await onSave({ ...d, price: cents });
    setSaving(false);
    if (r.error) setState({ error: r.error, fields: r.fields?.map((f) => f.replace(/^variant\./, "")) });
    else onClose();
  };

  return (
    <Sheet title={variantLabel(v.values)} onClose={onClose}>
      <div data-form className="space-y-4">
        <p className="-mt-2 text-[13px] text-muted">One combination of this product.</p>
        <Switch checked={d.on} onChange={(on) => setD({ ...d, on })} label="Offer this combination" hint="Off: it can't be picked (no Black in size 10, say)." />
        <Field label="Price" htmlFor="v-price" hint={inherited === null ? "Empty: no price yet." : `Empty: the product's price, ${formatPrice(inherited, currency)}.`}>
          <Input id="v-price" data-field="price" inputMode="decimal" className="font-mono" value={price} placeholder={inherited === null ? "" : priceInput(inherited)} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Product code" htmlFor="v-code">
          <Input id="v-code" data-field="code" value={d.code} maxLength={60} className="font-mono" onChange={(e) => setD({ ...d, code: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13.5px] text-body">Availability</p>
          <Segmented
            label="How this one is made"
            value={d.make}
            options={[
              ["madeToOrder", "Made to order"],
              ["ready", "In stock"],
              ["oneOnly", "One only"],
            ]}
            onChange={(make) => setD({ ...d, make: make as ProductMake, stock: make === "oneOnly" ? null : d.make === "oneOnly" ? null : d.stock })}
          />
        </div>
        {d.make === "ready" && (
          <Field label="How many do you have?" htmlFor="v-stock" hint="Comes off sale on its own when it runs out. Leave empty to not count.">
            <Input
              id="v-stock"
              data-field="stock"
              inputMode="numeric"
              className="max-w-[160px] font-mono"
              value={d.stock ?? ""}
              onChange={(e) => {
                const t = e.target.value.replace(/\D/g, "");
                setD({ ...d, stock: t === "" ? null : Math.min(Number(t), 1_000_000) });
              }}
            />
          </Field>
        )}
        {d.make === "oneOnly" && <Switch checked={d.stock !== 0} onChange={(left) => setD({ ...d, stock: left ? null : 0 })} label="Still available" hint="Turns off on its own when it sells." />}
        {d.make === "madeToOrder" && <p className="text-[12.5px] text-muted">{product.leadTime ? `Takes around ${product.leadTime} ${product.leadTime === 1 ? product.leadUnit.slice(0, -1) : product.leadUnit}, set under How it's made.` : "How long it takes is set under How it's made."}</p>}
        <p className="text-[12.5px] text-muted">Stock lives on the combination, not the product.</p>
        <Notice error={state.error} fields={state.fields} />
        <div className="flex gap-2">
          <Button type="button" className="flex-1" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save combination"}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** The line under a combination in the list: "2 left", "made to order", "not offered". */
function comboState(v: Variant): string {
  const s = variantState(v);
  if (s === "off") return "not offered";
  if (s === "sold") return "sold";
  if (s === "soldOut") return "sold out";
  if (v.make === "madeToOrder") return "made to order";
  if (v.make === "oneOnly") return "one only";
  return v.stock !== null ? `${v.stock} left` : "in stock";
}
