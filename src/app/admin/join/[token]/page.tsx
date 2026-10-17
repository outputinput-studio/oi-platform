import Link from "next/link";
import { ROLE_ABOUT } from "@/modules/auth/roles";
import { openInvitation } from "@/modules/team/invitations";
import { Shell } from "../../shell";
import { JoinForm, NewLinkForm } from "./join-forms";

export const dynamic = "force-dynamic";

/**
 * Where an invitation's link lands (design/admin.html: the Team invite).
 * Who invited you, to what, as what, and Join. An expired link asks for a
 * new one itself; a cancelled one says so. Signed out: joining hands on to
 * the usual emailed code.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await openInvitation(token);
  const footer = <>O/I is invite-only. If something here looks wrong, ask the person who runs your site.</>;

  if (!inv) {
    return (
      <Shell footer={footer}>
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">That link isn&apos;t right</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">Check you have the whole link from the email, or ask whoever invited you to send it again.</p>
      </Shell>
    );
  }
  if (inv.status === "accepted") {
    return (
      <Shell footer={footer}>
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">You&apos;re already on the team</h1>
        <p className="mb-7 mt-1.5 text-[13.5px] leading-relaxed text-muted">{inv.siteName} is waiting for you. Sign in with {inv.email}.</p>
        <Link href={`/sign-in?email=${encodeURIComponent(inv.email)}`} className="flex h-12 w-full items-center justify-center rounded-button bg-accent text-[16px] font-medium text-text hover:bg-accent-hover">
          Sign in
        </Link>
      </Shell>
    );
  }
  if (inv.status === "cancelled") {
    return (
      <Shell footer={footer}>
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">This invitation was cancelled</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">If you still need to help with {inv.siteName}, ask {inv.byName} to invite you again.</p>
      </Shell>
    );
  }
  if (inv.status === "expired") {
    return (
      <Shell footer={footer}>
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">This invitation has expired</h1>
        <p className="mb-7 mt-1.5 text-[13.5px] leading-relaxed text-muted">
          Invitations last 14 days. Ask for a new link and we&apos;ll send it to the address {inv.byName} invited — no need to get in touch with anyone.
        </p>
        <NewLinkForm token={token} />
      </Shell>
    );
  }
  return (
    <Shell footer={footer}>
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">Join {inv.siteName}</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        {inv.byName} invited <span className="font-mono text-text">{inv.email}</span> to help run {inv.siteName}.
      </p>
      <div className="mb-7 mt-5 rounded-card border border-line bg-surface px-4 py-3.5">
        <p className="label">As {inv.roleName}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-body">{ROLE_ABOUT[inv.role]}</p>
      </div>
      <JoinForm token={token} siteName={inv.siteName} />
    </Shell>
  );
}
