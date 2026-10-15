import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { HOME_SLUG, listPages } from "@/modules/pages/server";
import { PageHeader } from "../../ui";
import { NewPageForm } from "./new-page-form";

export const dynamic = "force-dynamic";

export default async function PagesPage() {
  const { user, site } = await requireSiteAccess();
  const all = await listPages({ actorId: user.id, siteId: site.id });
  const hasHome = all.some((p) => p.slug === HOME_SLUG);

  return (
    <>
      <PageHeader title="Content" back="/" />
      <p className="mt-5 text-sm text-[var(--muted)]">
        {all.length ? `${all.length} on ${site.name}.` : "No pages yet. Start with the home page."}
      </p>

      <section className="mt-6 rounded-md border border-[var(--border)] p-4">
        <h2 className="mb-3 text-base font-medium">New page</h2>
        <NewPageForm suggestHome={!hasHome} />
      </section>

      {all.length > 0 && (
        <ul className="mt-6 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {all.map((p) => (
            <li key={p.id}>
              <Link
                href={`/pages/${p.id}`}
                data-testid={`page-${p.slug}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--border)]/30"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base">{p.title}</span>
                  <span className="block truncate text-sm text-[var(--muted)]">
                    {p.slug === HOME_SLUG ? "Front page" : `/${p.slug}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-[var(--muted)]">{p.status === "published" ? "Live" : "Draft"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
