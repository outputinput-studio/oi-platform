import { requireSiteAccess } from "@/modules/auth/access";
import { EnvBadge, Wordmark } from "../shell";
import { Nav } from "./nav";

/**
 * The signed-in admin. Every page under here is for one site, chosen on
 * the site picker and re-checked against memberships on each request
 * (requireSiteAccess). Phone first: content fills the screen and the
 * navigation sits along the bottom; on a laptop it moves to the side.
 * One Nav, placed by CSS, so there is exactly one "Team" link on the page.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { site } = await requireSiteAccess();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 md:hidden">
        <Wordmark />
        <EnvBadge />
      </header>
      <aside className="md:flex md:w-52 md:flex-col md:border-r md:border-[var(--border)]">
        <div className="hidden flex-col gap-1 px-5 py-4 md:flex">
          <Wordmark />
          <EnvBadge />
        </div>
        <Nav />
      </aside>
      <main className="flex-1 px-4 pb-24 pt-5 md:px-10 md:pb-10 md:pt-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="mb-1 text-sm text-[var(--muted)]" data-testid="site-name">
            {site.name}
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
