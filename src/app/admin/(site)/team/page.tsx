import { requireSiteAccess } from "@/modules/auth/access";
import { listMembers } from "@/modules/team/server";
import { Label, PageHeader, Rows } from "../../ui";
import { AddMember, MemberRow } from "./team-forms";

export const dynamic = "force-dynamic";

/**
 * Who can sign in to this site. Owners can add, change roles and remove;
 * staff can see the list. The module enforces that; the screen just hides
 * what the person can't use.
 */
export default async function TeamPage() {
  const { user, site, role } = await requireSiteAccess();
  const members = await listMembers({ actorId: user.id, siteId: site.id });
  const owners = members.filter((m) => m.role === "owner").length;
  const canManage = role === "owner";

  return (
    <>
      <PageHeader title="Team" back="/" actions={canManage ? <AddMember /> : undefined} />
      <div className="pt-5 md:pt-6">
        <Label right={members.length === 1 ? "Just you so far" : `${members.length} people`}>People</Label>
        <Rows>
          {members.map((m) => (
            <MemberRow key={m.userId} member={m} isYou={m.userId === user.id} canManage={canManage} isLastOwner={m.role === "owner" && owners === 1} />
          ))}
        </Rows>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Owners can change the team and settings. Staff can do everything else. A site always keeps at least one owner.
        </p>
      </div>
    </>
  );
}
