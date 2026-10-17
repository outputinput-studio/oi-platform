import { requireOps } from "@/modules/ops/access";
import { PageHeader } from "../../../admin/ui";
import { OpsShell } from "../../ops-shell";
import { AddonEditor } from "../addon-editor";

export const dynamic = "force-dynamic";

export default async function NewAddon() {
  const user = await requireOps();
  return (
    <OpsShell email={user.email}>
      <PageHeader title="New add-on" back="/addons" />
      <div className="max-w-[640px] pt-5">
        <AddonEditor addon={null} sites={0} />
      </div>
    </OpsShell>
  );
}
