import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { Site } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { siteTheme } from "@/modules/sites/server";
import { themeVars } from "@/modules/sites/theme";
import { storefrontSite } from "@/modules/sites/storefront";
import { CONSENT_COOKIE, canTrack, readAnalytics, readCookieNotice } from "@/modules/sites/tracking";
import { readCustomCode } from "@/modules/sites/custom-code-rules";
import { AnalyticsScripts } from "./tracking";
import { CookieNotice } from "./cookie-notice";

/**
 * Every storefront page sits inside this. A site that hasn't launched
 * (Settings · Domain, Going live) shows visitors a holding page instead of
 * anything it has — pages, the shop, sign-in — while the team, with a
 * preview pass, sees the real thing.
 *
 * Around a visible site's pages: its custom code at the start and the end
 * (Settings · Custom code, owners only), its analytics once it's live
 * (Settings · Analytics), and the cookie notice until the visitor answers
 * it — with the notice on, analytics wait for Accept.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { site, hidden } = await storefrontSite();
  if (hidden) return <HoldingPage site={hidden} />;
  if (!site) return children;
  const code = readCustomCode(site.customCode);
  const analytics = readAnalytics(site.analytics);
  const notice = readCookieNotice(site.cookies);
  const consent = (await cookies()).get(CONSENT_COOKIE)?.value;
  const tracked = !!site.launchedAt && !!(analytics.gaId || analytics.metaPixelId);
  const theme = siteTheme(site);
  return (
    <>
      {code.head && <div data-custom-code="start" className="contents" dangerouslySetInnerHTML={{ __html: code.head }} />}
      {children}
      {code.body && <div data-custom-code="end" className="contents" dangerouslySetInnerHTML={{ __html: code.body }} />}
      {tracked && canTrack(notice, consent) && <AnalyticsScripts a={analytics} />}
      {notice.enabled && consent !== "yes" && consent !== "no" && (
        <div style={themeVars(theme) as React.CSSProperties}>
          <CookieNotice message={notice.message} policyPath={notice.policyPath} analytics={tracked ? analytics : null} />
        </div>
      )}
    </>
  );
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
