import { requireSiteAccess } from "@/modules/auth/access";
import { listMembers } from "@/modules/team/server";
import { AddMemberForm, MemberRow } from "./team-forms";

export const dynamic = "force-dynamic";

/**
 * Who can sign in to this site. Owners can add, change roles and remove;
 * staff can see the list. The module enforces that; the page just hides
 * what the person can't use.
 */
export default async function TeamPage() {
  const { user, site, role } = await requireSiteAccess();
  const members = await listMembers({ actorId: user.id, siteId: site.id });
  const owners = members.filter((m) => m.role === "owner").length;
  const canManage = role === "owner";

  return (
    <>
      <h1 className="text-2xl font-semibold">Team</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {members.length === 1 ? "Just you so far." : `${members.length} people can sign in to ${site.name}.`}
      </p>

      {canManage && (
        <section className="mt-6 rounded-md border border-[var(--border)] p-4">
          <h2 className="mb-3 text-base font-medium">Add someone</h2>
          <AddMemberForm />
        </section>
      )}

      <ul className="mt-6 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
        {members.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            isYou={m.userId === user.id}
            canManage={canManage}
            isLastOwner={m.role === "owner" && owners === 1}
          />
        ))}
      </ul>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Owners can change the team and settings. Staff can do everything else. A site always keeps at least one owner.
      </p>
    </>
  );
}
