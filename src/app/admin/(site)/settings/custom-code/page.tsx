import { requireSiteAccess } from "@/modules/auth/access";
import { readCustomCode } from "@/modules/sites/custom-code-rules";
import { PageHeader } from "../../../ui";
import { CustomCodeForm } from "./custom-code-form";

export const dynamic = "force-dynamic";

/** Settings · Custom code: owners only; managers can read it. Earlier versions can be put back. */
export default async function CustomCodePage() {
  const { site, role } = await requireSiteAccess("manager");
  const code = readCustomCode(site.customCode);
  return (
    <>
      <PageHeader title="Custom code" back="/settings" />
      <div className="max-w-[720px] pt-5 md:pt-6">
        {/* A version put back elsewhere (or here) starts the boxes afresh. */}
        <CustomCodeForm key={code.at || "none"} code={code} canEdit={role === "owner"} />
      </div>
    </>
  );
}
