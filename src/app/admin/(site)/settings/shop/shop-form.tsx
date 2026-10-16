"use client";

import { useActionState, useState } from "react";
import { updateShopSettingsAction, type SettingsFormState } from "@/modules/sites/actions";
import { CURRENCIES, type ShopSettings } from "@/modules/sites/shop";
import { Field, Input, SaveBar, Select, Switch } from "../../../ui";

const NAMES: Record<string, string> = {
  AUD: "Australian dollar",
  NZD: "New Zealand dollar",
  THB: "Thai baht",
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  SGD: "Singapore dollar",
};

export function ShopForm({ initial, canEdit }: { initial: ShopSettings; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await updateShopSettingsAction(prev, form);
    if (r.ok) setSaved(v);
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  return (
    <form action={act} className="space-y-5">
      <Field label="Currency" htmlFor="shop-currency" hint="Every price on your site is in this. Changing it doesn't convert prices you've already set.">
        <Select id="shop-currency" name="currency" value={v.currency} disabled={!canEdit} onChange={(e) => setV({ ...v, currency: e.target.value as ShopSettings["currency"] })}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {NAMES[c]} ({c})
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Tax name" htmlFor="shop-tax-name" hint="GST, VAT…">
          <Input id="shop-tax-name" name="taxName" value={v.taxName} maxLength={20} readOnly={!canEdit} onChange={(e) => setV({ ...v, taxName: e.target.value })} />
        </Field>
        <Field label="Rate %" htmlFor="shop-tax-rate">
          <Input id="shop-tax-rate" name="taxRate" inputMode="decimal" className="font-mono" value={String(v.taxRate)} readOnly={!canEdit} onChange={(e) => setV({ ...v, taxRate: e.target.value as unknown as number })} />
        </Field>
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        <input type="hidden" name="pricesIncludeTax" value={v.pricesIncludeTax ? "on" : "off"} />
        <Switch
          checked={v.pricesIncludeTax}
          disabled={!canEdit}
          onChange={(pricesIncludeTax) => setV({ ...v, pricesIncludeTax })}
          label={`Prices include ${v.taxName || "tax"}`}
          hint="On: the price you enter is what people pay. Off: tax is added at checkout."
        />
      </div>
      {canEdit ? <SaveBar dirty={dirty} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
