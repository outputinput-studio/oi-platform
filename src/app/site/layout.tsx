import type { Metadata } from "next";
import type { Site } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { siteTheme } from "@/modules/sites/server";
import { themeVars } from "@/modules/sites/theme";
import { storefrontSite } from "@/modules/sites/storefront";

/**
 * Every storefront page sits inside this. A site that hasn't launched
 * (Settings · Domain, Going live) shows visitors a holding page instead of
 * anything it has — pages, the shop, sign-in — while the team, with a
 * preview pass, sees the real thing.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { hidden } = await storefrontSite();
  if (hidden) return <HoldingPage site={hidden} />;
  return children;
}

export async function generateMetadata(): Promise<Metadata> {
  const { hidden } = await storefrontSite();
  return hidden ? { title: hidden.name, robots: { index: false, follow: false } } : {};
}

function HoldingPage({ site }: { site: Site }) {
  const theme = siteTheme(site);
  return (
    <main data-surface="site" data-testid="holding" data-theme={theme.mode} style={themeVars(theme) as React.CSSProperties} className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
      <div className="text-center">
        {theme.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
          <img src={mediaUrl(theme.logo.key)} alt={theme.logo.alt || site.name} width={theme.logo.width} height={theme.logo.height} className="mx-auto block h-12 w-auto max-w-[240px] object-contain" />
        ) : (
          <p className="text-2xl font-semibold">{site.name}</p>
        )}
        <p className="mt-3 text-[var(--text-muted)]">Something is on its way.</p>
      </div>
    </main>
  );
}
