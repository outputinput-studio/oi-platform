import { notFound } from "next/navigation";
import { requireOps } from "@/modules/ops/access";
import { getAddon } from "@/modules/addons/server";
import { PageHeader } from "../../../admin/ui";
import { OpsShell } from "../../ops-shell";
import { AddonEditor } from "../addon-editor";

export const dynamic = "force-dynamic";

export default async function EditAddon({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  const user = await requireOps();
  const addon = await getAddon({ actorId: user.id, id: (await params).id });
  if (!addon) notFound();
  const { added } = await searchParams;
  return (
    <OpsShell email={user.email}>
      <PageHeader title={addon.name} back="/addons" />
      <div className="max-w-[640px] space-y-4 pt-5">
        {added && (
          <p role="status" className="text-[13.5px] text-success">
            ✓ Added. Sites see it on Settings · Plan.
          </p>
        )}
        <AddonEditor id={addon.id} addon={addon} sites={addon.sites} />
      </div>
    </OpsShell>
  );
}
