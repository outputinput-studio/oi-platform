import { requireSiteAccess } from "@/modules/auth/access";
import { siteAddress } from "@/lib/hosts";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { getPage, HOME_SLUG } from "@/modules/pages/server";
import { listForms } from "@/modules/forms/server";
import { addSectionAction, deletePageAction, moveSectionAction, removeSectionAction, setPageStatusAction } from "@/modules/pages/actions";
import { imageRef, type SectionType } from "@/modules/pages/registry";
import { readSeo } from "@/modules/pages/seo";
import { fallbacksFromSections } from "@/app/site/metadata";
import { headers } from "next/headers";
import { Editor, type EditorSection } from "./editor";

export const dynamic = "force-dynamic";

/** Loads the page and hands it to the editor, with each image's address worked out here (it depends on settings). */
export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess("manager");
  const [page, forms] = await Promise.all([getPage({ actorId: user.id, siteId: site.id, pageId: id }), listForms({ actorId: user.id, siteId: site.id })]);
  // The public address: the admin host with "admin" swapped for the site's slug.
  const adminHost = (await headers()).get("x-oi-host") ?? "";
  const siteUrl = `${siteAddress(site, adminHost)}${page.slug === HOME_SLUG ? "" : `/${page.slug}`}`;
  const seo = readSeo(page.seo);
  const fb = fallbacksFromSections(page.sections);

  const sections: EditorSection[] = page.sections.map((s) => {
    const r = imageRef.safeParse((s.data as Record<string, unknown>).image);
    return { id: s.id, type: s.type as SectionType, data: s.data, imageUrl: r.success ? mediaUrl(r.data.key) : undefined };
  });

  return (
    <Editor
      page={{ id: page.id, title: page.title, slug: page.slug }}
      sections={sections}
      isHome={page.slug === HOME_SLUG}
      status={page.status}
      scheduledAt={page.status === "scheduled" && page.publishedAt ? page.publishedAt.toISOString() : null}
      mediaAvailable={mediaAvailable()}
      forms={forms.map((f) => ({ id: f.id, name: f.name }))}
      siteUrl={siteUrl}
      seo={{
        initial: seo,
        imageUrl: seo.image ? mediaUrl(seo.image.key) : undefined,
        fallback: { title: page.slug === HOME_SLUG ? site.name : `${page.title} · ${site.name}`, description: fb.description, imageUrl: fb.image ? mediaUrl(fb.image.key) : undefined },
        host: siteAddress(site, adminHost),
        path: page.slug === HOME_SLUG ? "/" : `/${page.slug}`,
      }}
      actions={{
        setStatus: setPageStatusAction,
        addSection: addSectionAction,
        moveSection: moveSectionAction,
        removeSection: removeSectionAction,
        deletePage: deletePageAction,
      }}
    />
  );
}
