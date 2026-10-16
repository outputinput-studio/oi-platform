import { requireSiteAccess } from "@/modules/auth/access";
import { getPage } from "@/modules/pages/server";
import { RenderSections } from "@/modules/pages/render";
import { Frame } from "@/app/site/storefront";
import { siteMenus } from "@/modules/menus/server";
import { HOME_SLUG } from "@/modules/pages/server";

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
  const [page, menus] = await Promise.all([getPage({ actorId: user.id, siteId: site.id, pageId: id }), siteMenus({ siteId: site.id })]);
  const path = page.slug === HOME_SLUG ? "/" : `/${page.slug}`;
  // A draft page isn't in the automatic menu yet; show it where it will go.
  const header =
    menus.automaticHeader && path !== "/" && !menus.header.some((l) => l.href === path) ? [...menus.header, { label: page.title, href: path, external: false, newTab: false, children: [] }] : menus.header;
  return (
    <Frame site={site} menus={{ ...menus, header }} current={path} preview>
      <h1 className="sr-only">{page.title}</h1>
      <RenderSections sections={page.sections} />
    </Frame>
  );
}
