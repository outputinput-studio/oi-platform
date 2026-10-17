import { requireSiteAccess } from "@/modules/auth/access";
import { listMembers } from "@/modules/team/server";
import { Label, PageHeader, Rows } from "../../ui";
import { AddMember, MemberRow } from "./team-forms";

export const dynamic = "force-dynamic";

/**
 * Who can sign in to this site, as in design/admin.html (Team). Owners
 * add people, change roles and remove them; Managers can see the list.
 * The module enforces that; the screen just hides what they can't use.
 */
export default async function TeamPage() {
  const { user, site, role } = await requireSiteAccess("manager");
  const members = await listMembers({ actorId: user.id, siteId: site.id });
  const owners = members.filter((m) => m.role === "owner").length;
  const canManage = role === "owner";

  return (
    <>
      <PageHeader title="Team" back="/" actions={canManage ? <AddMember /> : undefined} />
      <div className="pt-5 md:pt-6">
        <p data-testid="roles-intro" className="mb-6 max-w-[620px] text-[14px] leading-relaxed text-body">
          Three roles, fixed. An Owner can do everything, including the team and the domain, a Manager runs the shop and the site, and Staff handle
          orders, the inbox and contacts.
        </p>
        <Label right={members.length === 1 ? "Just you so far" : `${members.length} people`}>Who can sign in</Label>
        <Rows>
          {members.map((m) => (
            <MemberRow key={m.userId} member={m} isYou={m.userId === user.id} canManage={canManage} isLastOwner={m.role === "owner" && owners === 1} siteName={site.name} />
          ))}
        </Rows>
      </div>
    </>
  );
}
