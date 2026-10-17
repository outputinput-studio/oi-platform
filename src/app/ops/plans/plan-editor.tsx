"use client";

import { keepValues } from "../../keep-values";
import { useActionState } from "react";
import { deleteDefaultPlanAction, saveDefaultPlanAction, type OpsFormState } from "@/modules/ops/actions";
import type { Plan } from "@/modules/plans/plan";
import { Button, Notice } from "../../admin/ui";
import { PlanFields } from "../plan-fields";

/** Add or change one of our default plans. Every site on it follows a change. */
export function PlanEditor({ id, plan, sites }: { id?: string; plan: Plan | null; sites: number }) {
  const [state, save, saving] = useActionState(saveDefaultPlanAction, {} as OpsFormState);
  const [gone, remove, removing] = useActionState(deleteDefaultPlanAction, {} as OpsFormState);
  return (
    <div className="space-y-4">
      <form onSubmit={keepValues(save)} className="space-y-4 rounded-card border border-line bg-surface p-4">
        {id && <input type="hidden" name="id" value={id} />}
        <PlanFields plan={plan} />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : id ? "Save plan" : "Add plan"}
          </Button>
          <Notice {...state} />
        </div>
        {id && sites > 0 && (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {sites} {sites === 1 ? "site is" : "sites are"} on this plan and follow every change. A new price applies from each paying site&apos;s next bill; the currency
            can&apos;t change while any of them pays.
          </p>
        )}
      </form>
      {id && (
        <form action={remove} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="danger" size="sm" disabled={removing || sites > 0}>
            {removing ? "Removing…" : "Remove this plan"}
          </Button>
          {sites > 0 && <p className="text-[12.5px] text-muted">Move its sites to another plan first.</p>}
          <Notice {...gone} />
        </form>
      )}
    </div>
  );
}
