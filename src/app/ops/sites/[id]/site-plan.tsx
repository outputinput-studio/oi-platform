"use client";

import { keepValues } from "../../../admin/keep-values";
import { useActionState, useState } from "react";
import Link from "next/link";
import { assignPlanAction, setPlanAction, type OpsFormState } from "@/modules/ops/actions";
import { limitsLine, type Plan } from "@/modules/plans/plan";
import { formatPrice } from "@/modules/sites/shop";
import { Button, Field, Notice, Select } from "../../../admin/ui";
import { PlanFields } from "../../plan-fields";

export type PlanChoice = Plan & { id: string; sites: number };

const CUSTOM = "custom";

/**
 * A site's plan, in ops: one of our default plans, or a custom one made
 * for this site alone. A site on a default plan follows every change made
 * to it in Plans.
 */
export function SitePlan({ siteId, plan, planId, choices }: { siteId: string; plan: Plan | null; planId: string | null; choices: PlanChoice[] }) {
  const [pick, setPick] = useState(planId ?? (plan || !choices.length ? CUSTOM : ""));
  const [assigned, assign, assigning] = useActionState(assignPlanAction, {} as OpsFormState);
  const [saved, save, saving] = useActionState(setPlanAction, {} as OpsFormState);
  const chosen = choices.find((c) => c.id === pick) ?? null;

  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-4">
      {choices.length > 0 && (
        <Field label="Plan" htmlFor="plan-pick">
          <Select id="plan-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
            {!planId && !plan && <option value="">Choose a plan…</option>}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {formatPrice(c.price, c.currency)} a month
              </option>
            ))}
            <option value={CUSTOM}>Custom — just for this site</option>
          </Select>
        </Field>
      )}

      {chosen && (
        <form action={assign} className="space-y-3">
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="planId" value={chosen.id} />
          <div data-testid="plan-summary" className="rounded-card border border-line px-3.5 py-3">
            {chosen.description && <p className="text-[14px] leading-relaxed text-body">{chosen.description}</p>}
            <p className="mt-1.5 font-mono text-[12.5px] text-muted">{limitsLine(chosen)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {chosen.id === planId ? (
              <p className="text-[13.5px] text-success">✓ They&apos;re on this plan</p>
            ) : (
              <Button type="submit" disabled={assigning}>
                {assigning ? "Saving…" : "Put them on this plan"}
              </Button>
            )}
            <Link href={`/plans/${chosen.id}`} className="text-[13.5px] text-body underline-offset-4 hover:underline">
              Change it for every site on it
            </Link>
            <Notice {...assigned} />
          </div>
        </form>
      )}

      {pick === CUSTOM && (
        <form onSubmit={keepValues(save)} className="space-y-4">
          <input type="hidden" name="siteId" value={siteId} />
          {/* Starts from what they're on now, a default plan's numbers included. */}
          <PlanFields plan={plan} />
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save plan"}
            </Button>
            <Notice {...saved} />
          </div>
          {choices.length > 0 && <p className="text-[12.5px] text-muted">A custom plan is this site&apos;s alone: changes to our plans don&apos;t touch it.</p>}
        </form>
      )}
    </div>
  );
}
