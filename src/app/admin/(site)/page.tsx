import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";

export const dynamic = "force-dynamic";

/** The site's home. For now, a landing with the two things that exist. */
export default async function AdminHome() {
  const { site, role } = await requireSiteAccess();
  return (
    <>
      <h1 className="text-2xl font-semibold">Home</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {site.name} · you&apos;re signed in as <span data-testid="role">{role}</span>.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Card href="/team" title="Team" body="Who can sign in to this site, and as what." />
        <Card href="/settings" title="Settings" body="The site's name. More arrives with each stage." />
      </div>
      <p className="mt-10 text-sm text-[var(--muted)]">Pages, media, forms and the inbox are the next stages.</p>
    </>
  );
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-[var(--border)] p-4 hover:border-[var(--accent)]"
    >
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>
    </Link>
  );
}
