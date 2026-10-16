import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { listNotFound, listRedirects } from "@/modules/redirects/server";
import { dismissNotFoundAction, removeRedirectAction } from "@/modules/redirects/actions";
import { siteSearch } from "@/modules/sites/server";
import { Button, Card, Chips, PageHeader } from "../../../ui";
import { AddRule, AutoRedirectSwitch } from "./redirect-forms";

export const dynamic = "force-dynamic";

/**
 * Settings · Redirects, as in design/admin.html: addresses people landed
 * on that don't exist, each with "Redirect this"; the rules in force;
 * and the switch that makes a rename keep its old link working.
 */
export default async function RedirectsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { user, site, role } = await requireSiteAccess();
  const [misses, rules] = await Promise.all([listNotFound({ actorId: user.id, siteId: site.id }), listRedirects({ actorId: user.id, siteId: site.id })]);
  const showRules = tab === "rules";
  const chips = [
    { href: "/settings/redirects", label: "Not found", count: misses.length },
    { href: "/settings/redirects?tab=rules", label: "Rules", count: rules.length },
  ];
  const when = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <PageHeader title="Redirects" back="/settings" actions={<AddRule />} />
      <div className="max-w-[640px] pt-4 md:pt-5">
        <Chips ariaLabel="Redirects" current={showRules ? "/settings/redirects?tab=rules" : "/settings/redirects"} items={chips} />

        {!showRules ? (
          <section className="mt-5">
            <p className="mb-3 text-[13px] text-muted">Addresses people have actually landed on that don&apos;t exist — usually old links from before the site moved. Point each one somewhere useful.</p>
            {misses.length === 0 ? (
              <Card variant="static" className="px-5 py-8 text-center">
                <p className="text-[15px] font-medium">Nothing missing</p>
                <p className="mt-1 text-[13px] text-muted">Nobody has landed on an address that doesn&apos;t exist. If they do, it shows up here.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-line-soft">
                {misses.map((m) => (
                  <div key={m.id} data-testid="not-found" className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13.5px] text-text">{m.path}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {m.hits} visit{m.hits === 1 ? "" : "s"} · last {timeAgo(m.lastSeen)} · {m.referrer ? `from ${m.referrer}` : "typed in"}
                      </p>
                    </div>
                    <div className="flex flex-none gap-2">
                      <AddRule from={m.path} label="Redirect this" />
                      <form action={dismissNotFoundAction}>
                        <input type="hidden" name="path" value={m.path} />
                        <Button type="submit" variant="quiet" size="sm">
                          Ignore
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </Card>
            )}
            <p className="mt-3 text-[12.5px] text-muted">We keep 90 days of these. Anything with one or two visits is usually a bot — leave it.</p>
          </section>
        ) : (
          <section className="mt-5">
            {rules.length === 0 ? (
              <Card variant="static" className="px-5 py-8 text-center">
                <p className="text-[15px] font-medium">No rules yet</p>
                <p className="mt-1 text-[13px] text-muted">A rule sends one address to another. Add one at the top, or from the Not found list.</p>
              </Card>
            ) : (
              <Card className="divide-y divide-line-soft">
                {rules.map((r) => (
                  <div key={r.id} data-testid="rule" className="flex items-center gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13.5px] text-text">{r.fromPath}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[12.5px] text-body">
                        <span aria-hidden>→</span>
                        {r.toPath}
                      </p>
                      <p className="mt-1 text-[12px] text-muted">
                        {r.hits} {r.hits === 1 ? "person" : "people"} sent on · {r.source === "auto" ? "added automatically" : `added ${when(r.createdAt)}`}
                      </p>
                    </div>
                    <form action={removeRedirectAction}>
                      <input type="hidden" name="redirectId" value={r.id} />
                      <Button type="submit" variant="quiet" size="sm">
                        Remove
                      </Button>
                    </form>
                  </div>
                ))}
              </Card>
            )}
          </section>
        )}

        <div className="mt-8 rounded-card border border-line bg-surface p-4">
          <AutoRedirectSwitch initial={siteSearch(site).autoRedirect} settings={siteSearch(site)} canEdit={role === "owner"} />
        </div>
      </div>
    </>
  );
}
