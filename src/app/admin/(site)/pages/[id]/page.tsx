import { requireSiteAccess } from "@/modules/auth/access";
import { getPage, HOME_SLUG } from "@/modules/pages/server";
import { addSectionAction, deletePageAction, moveSectionAction, removeSectionAction, setPageStatusAction } from "@/modules/pages/actions";
import { imageRef, sectionTypes, type SectionType } from "@/modules/pages/registry";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { Button, PageHeader } from "../../../ui";
import { PageSettingsForm } from "./page-settings-form";
import { SectionEditor } from "./section-editor";
import { AddSection } from "./add-section";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const page = await getPage({ actorId: user.id, siteId: site.id, pageId: id });
  const isHome = page.slug === HOME_SLUG;
  const live = page.status === "published";
  const images = mediaAvailable();
  // The image's address is settings-dependent, so it's worked out here, not stored.
  const imageUrlOf = (data: Record<string, unknown>) => {
    const r = imageRef.safeParse(data.image);
    return r.success ? mediaUrl(r.data.key) : undefined;
  };

  return (
    <>
      <PageHeader
        title="Edit page"
        back="/pages"
        actions={
          <form action={setPageStatusAction} className="flex items-center gap-3">
            <input type="hidden" name="pageId" value={page.id} />
            <input type="hidden" name="status" value={live ? "draft" : "published"} />
            <span data-testid="page-status" className={`text-[13px] ${live ? "text-success" : "text-muted"}`}>
              {live ? "Live" : "Draft"}
            </span>
            <Button type="submit" size="sm" variant={live ? "secondary" : "primary"}>
              {live ? "Unpublish" : "Publish"}
            </Button>
          </form>
        }
      />
      <div className="mt-5">
        <h2 className="truncate text-xl font-semibold">{page.title}</h2>
        <p className="mt-1 font-mono text-[12.5px] text-muted">{isHome ? "front page" : `/${page.slug}`}</p>
      </div>

      <section className="mt-6 space-y-4" aria-label="Sections">
        {page.sections.length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            This page is empty. Add a section to begin.
          </p>
        )}
        {page.sections.map((s, i) => {
          const type = s.type as SectionType;
          return (
            <article
              key={s.id}
              data-testid={`section-${i}`}
              className="rounded-md border border-[var(--border)]"
            >
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
                <h2 className="text-sm font-medium">{sectionTypes[type]?.label ?? s.type}</h2>
                <div className="flex gap-1">
                  <form action={moveSectionAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" variant="quiet" disabled={i === 0} aria-label="Move up" className="px-3">
                      ↑
                    </Button>
                  </form>
                  <form action={moveSectionAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" variant="quiet" disabled={i === page.sections.length - 1} aria-label="Move down" className="px-3">
                      ↓
                    </Button>
                  </form>
                  <form action={removeSectionAction}>
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="sectionId" value={s.id} />
                    <Button type="submit" variant="quiet" aria-label="Remove section" className="px-3">
                      Remove
                    </Button>
                  </form>
                </div>
              </header>
              <div className="p-4">
                <SectionEditor sectionId={s.id} type={type} initial={s.data} imageUrl={imageUrlOf(s.data)} mediaAvailable={images} />
              </div>
            </article>
          );
        })}
        <AddSection pageId={page.id} action={addSectionAction} />
      </section>

      <section className="mt-10 rounded-md border border-[var(--border)] p-4">
        <h2 className="mb-3 text-base font-medium">Page settings</h2>
        <PageSettingsForm pageId={page.id} title={page.title} slug={page.slug} isHome={isHome} />
        {!isHome && (
          <form action={deletePageAction} className="mt-6 border-t border-[var(--border)] pt-4">
            <input type="hidden" name="pageId" value={page.id} />
            <Button type="submit" variant="danger">
              Delete this page
            </Button>
            <p className="mt-2 text-sm text-[var(--muted)]">It comes off the site straight away. We keep a copy, so ask us if you need it back.</p>
          </form>
        )}
      </section>
    </>
  );
}
