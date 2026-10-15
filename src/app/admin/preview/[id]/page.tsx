import { requireSiteAccess } from "@/modules/auth/access";
import { getPage, publishedPages } from "@/modules/pages/server";
import { RenderSections } from "@/modules/pages/render";
import { Frame } from "@/app/site/storefront";

export const dynamic = "force-dynamic";

/**
 * What a page will look like, for the editor's preview pane: the real
 * storefront frame and sections, draft included. Signed-in members of
 * the site only; it sits outside the (site) group so no admin chrome
 * wraps it. The editor loads it in an iframe at /preview/<id>.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const [page, menu] = await Promise.all([getPage({ actorId: user.id, siteId: site.id, pageId: id }), publishedPages({ siteId: site.id })]);
  // A draft page isn't in the menu yet; show it where it will go.
  const withThis = menu.some((p) => p.id === page.id) ? menu : [...menu, { id: page.id, slug: page.slug, title: page.title }];
  return (
    <Frame site={site} menu={withThis} current={page.slug} preview>
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </Frame>
  );
}
