"use client";

import type { Plan } from "@/modules/plans/plan";
import { CURRENCIES } from "@/modules/sites/shop";
import { Field, Input, Select, Textarea } from "../admin/ui";

/** A plan's boxes: a site's custom plan and our default plans use the same ones. A limit left empty is no limit. */
export function PlanFields({ plan }: { plan: Plan | null }) {
  const lim = plan?.limits;
  return (
    <>
      <Field label="Name" htmlFor="plan-name" hint="What they see: Shop and journal, Site, Shop…">
        <Input id="plan-name" name="name" defaultValue={plan?.name ?? ""} maxLength={60} />
      </Field>
      <Field label="What it includes" htmlFor="plan-description" hint="In their words. Shown under the name in Settings · Plan.">
        <Textarea id="plan-description" name="description" rows={3} defaultValue={plan?.description ?? ""} maxLength={400} />
      </Field>
      <div className="grid grid-cols-[1fr_160px] gap-3">
        <Field label="Price a month" htmlFor="plan-price">
          <Input id="plan-price" name="price" inputMode="decimal" className="font-mono" defaultValue={plan ? String(plan.price / 100) : ""} />
        </Field>
        <Field label="Currency" htmlFor="plan-currency">
          <Select id="plan-currency" name="currency" defaultValue={plan?.currency ?? "AUD"}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="label pt-2">Limits — empty is no limit</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Photos and files (GB)" htmlFor="plan-storage">
          <Input id="plan-storage" name="limits.storageGb" inputMode="decimal" className="font-mono" defaultValue={lim ? String(lim.storageGb) : "5"} />
        </Field>
        <Field label="Products" htmlFor="plan-products">
          <Input id="plan-products" name="limits.products" inputMode="numeric" className="font-mono" defaultValue={lim?.products ?? ""} />
        </Field>
        <Field label="People who can log in" htmlFor="plan-people">
          <Input id="plan-people" name="limits.people" inputMode="numeric" className="font-mono" defaultValue={lim?.people ?? ""} />
        </Field>
        <Field label="Visits a month" htmlFor="plan-visits">
          <Input id="plan-visits" name="limits.visits" inputMode="numeric" className="font-mono" defaultValue={lim?.visits ?? ""} />
        </Field>
      </div>
    </>
  );
}
