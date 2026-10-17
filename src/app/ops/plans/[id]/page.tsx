import { notFound } from "next/navigation";
import { requireOps } from "@/modules/ops/access";
import { defaultPlan } from "@/modules/plans/catalogue";
import { PageHeader } from "../../../admin/ui";
import { OpsShell } from "../../ops-shell";
import { PlanEditor } from "../plan-editor";

export const dynamic = "force-dynamic";

export default async function EditPlan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  const user = await requireOps();
  const plan = await defaultPlan({ actorId: user.id, id: (await params).id });
  if (!plan) notFound();
  const { added } = await searchParams;
  return (
    <OpsShell email={user.email}>
      <PageHeader title={plan.name} back="/plans" />
      <div className="max-w-[640px] space-y-4 pt-5">
        {added && (
          <p role="status" className="text-[13.5px] text-success">
            ✓ Added. Put sites on it from their page.
          </p>
        )}
        <PlanEditor id={plan.id} plan={plan} sites={plan.sites} />
      </div>
    </OpsShell>
  );
}
