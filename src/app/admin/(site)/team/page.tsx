import { requireSiteAccess } from "@/modules/auth/access";
import { headers } from "next/headers";
import { listMembers } from "@/modules/team/server";
import { listInvitations } from "@/modules/team/invitations";
import { supportContact } from "@/modules/auth/support";
import { Label, PageHeader, Pill, Rows } from "../../ui";
import { Avatar } from "../nav";
import { InviteRowView, InviteSomeone, MemberRow } from "./team-forms";

export const dynamic = "force-dynamic";

/**
 * Who can sign in to this site, as in design/admin.html (Team). Owners
 * add people, change roles and remove them; Managers can see the list.
 * The module enforces that; the screen just hides what they can't use.
 */
export default async function TeamPage() {
  const { user, site, role } = await requireSiteAccess("manager");
  const host = (await headers()).get("x-oi-host") ?? "";
  const [members, invites] = await Promise.all([listMembers({ actorId: user.id, siteId: site.id }), listInvitations({ actorId: user.id, siteId: site.id, host })]);
  const owners = members.filter((m) => m.role === "owner").length;
  const canManage = role === "owner";
  const support = supportContact();

  return (
    <>
      <PageHeader title="Team" back="/" actions={canManage ? <InviteSomeone /> : undefined} />
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
          {support && (
            <div data-testid="support-row" className="flex items-start gap-3 px-4 py-3.5">
              <Avatar name="O I" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">Output/Input</p>
                <p className="truncate font-mono text-[12.5px] text-muted">{support.emails.join(", ")}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                  This is how we look after your site — building, fixing and updating it. Ask us and we&apos;ll remove it, though it means everything then
                  comes back to you.
                </p>
              </div>
              <Pill tone="neutral">Output/Input · Support</Pill>
            </div>
          )}
        </Rows>

        {invites.length > 0 && (
          <section className="mt-8">
            <Label>Waiting to accept</Label>
            <Rows>
              {invites.map((i) => (
                <InviteRowView key={i.id} inv={i} canManage={canManage} />
              ))}
            </Rows>
          </section>
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Invitations last 14 days. An expired link lets them ask for a new one themselves — nobody has to call us.
        </p>
      </div>
    </>
  );
}
