"use client";

import { keepValues } from "../../keep-values";
import { useActionState, useState } from "react";
import { deleteAddonAction, saveAddonAction, type AddonFormState } from "@/modules/addons/actions";
import type { Addon, AddonKind } from "@/modules/addons/addon";
import { CURRENCIES } from "@/modules/sites/shop";
import { Button, Field, Input, Notice, Select, Switch, Textarea } from "../../admin/ui";

const KINDS: [AddonKind, string, string][] = [
  ["storage", "More room for photos and files", "GB"],
  ["visits", "More visits a month", "Visits"],
  ["people", "More people who can log in", "People"],
  ["feature", "A feature (Booking calendar, Quotes…)", ""],
];

/** Add or change one of our add-ons. A new price reaches every site with it, from its next bill. */
export function AddonEditor({ id, addon, sites }: { id?: string; addon: Addon | null; sites: number }) {
  const [state, save, saving] = useActionState(saveAddonAction, {} as AddonFormState);
  const [gone, remove, removing] = useActionState(deleteAddonAction, {} as AddonFormState);
  const [kind, setKind] = useState<AddonKind>(addon?.kind ?? "storage");
  const [selfServe, setSelfServe] = useState(addon?.selfServe ?? true);
  const unit = KINDS.find((k) => k[0] === kind)?.[2] ?? "";
  return (
    <div className="space-y-4">
      <form onSubmit={keepValues(save)} className="space-y-4 rounded-card border border-line bg-surface p-4">
        {id && <input type="hidden" name="id" value={id} />}
        <Field label="Name" htmlFor="addon-name" hint="What they see: Another 10 GB for photos, One more person…">
          <Input id="addon-name" name="name" defaultValue={addon?.name ?? ""} maxLength={60} />
        </Field>
        <Field label="What it does" htmlFor="addon-description">
          <Textarea id="addon-description" name="description" rows={2} defaultValue={addon?.description ?? ""} maxLength={300} />
        </Field>
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <Field label="Price a month" htmlFor="addon-price">
            <Input id="addon-price" name="price" inputMode="decimal" className="font-mono" defaultValue={addon ? String(addon.price / 100) : ""} />
          </Field>
          <Field label="Currency" htmlFor="addon-currency">
            <Select id="addon-currency" name="currency" defaultValue={addon?.currency ?? "AUD"}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_160px] gap-3">
          <Field label="It adds" htmlFor="addon-kind">
            <Select id="addon-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AddonKind)}>
              {KINDS.map(([k, words]) => (
                <option key={k} value={k}>
                  {words}
                </option>
              ))}
            </Select>
          </Field>
          {kind !== "feature" && (
            <Field label={`How many (${unit})`} htmlFor="addon-amount">
              <Input id="addon-amount" name="amount" inputMode="numeric" className="font-mono" defaultValue={addon?.amount ?? ""} />
            </Field>
          )}
        </div>
        <input type="hidden" name="selfServe" value={selfServe ? "on" : ""} />
        <Switch
          checked={selfServe}
          onChange={setSelfServe}
          label="Owners add it themselves"
          hint={selfServe ? "One tap on Settings · Plan, on straight away." : "Shown as “Ask us”: they send us a note and we add it from their page here."}
        />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : id ? "Save add-on" : "Add add-on"}
          </Button>
          <Notice {...state} />
        </div>
        {id && sites > 0 && (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {sites} {sites === 1 ? "site has" : "sites have"} it. A new price applies from each paying site&apos;s next bill; the currency stays while any site has it.
          </p>
        )}
      </form>
      {id && (
        <form action={remove} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="danger" size="sm" disabled={removing || sites > 0}>
            {removing ? "Removing…" : "Remove this add-on"}
          </Button>
          {sites > 0 && <p className="text-[12.5px] text-muted">Take it off its sites first.</p>}
          <Notice {...gone} />
        </form>
      )}
    </div>
  );
}
