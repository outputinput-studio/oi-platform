import { requireOps } from "@/modules/ops/access";
import { PageHeader } from "../../../admin/ui";
import { OpsShell } from "../../ops-shell";
import { PlanEditor } from "../plan-editor";

export const dynamic = "force-dynamic";

export default async function NewPlan() {
  const user = await requireOps();
  return (
    <OpsShell email={user.email}>
      <PageHeader title="New plan" back="/plans" />
      <div className="max-w-[640px] pt-5">
        <PlanEditor plan={null} sites={0} />
      </div>
    </OpsShell>
  );
}
