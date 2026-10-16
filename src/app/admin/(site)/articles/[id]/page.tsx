import { headers } from "next/headers";
import { requireSiteAccess } from "@/modules/auth/access";
import { getArticle } from "@/modules/articles/server";
import { deleteArticleAction, setArticleStatusAction } from "@/modules/articles/actions";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { readSeo } from "@/modules/pages/seo";
import { ArticleEditor } from "./article-editor";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const a = await getArticle({ actorId: user.id, siteId: site.id, articleId: id });
  const adminHost = (await headers()).get("x-oi-host") ?? "";
  const siteHost = adminHost.replace(/^admin\./, `${site.slug}.`);
  const seo = readSeo(a.seo);
  return (
    <ArticleEditor
      article={{
        id: a.id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        body: a.body,
        cover: a.cover ?? undefined,
        coverUrl: a.cover ? mediaUrl(a.cover.key) : undefined,
        author: a.author,
        publishedOn: a.publishedAt ? a.publishedAt.toISOString().slice(0, 10) : "",
        live: a.status === "published",
      }}
      seo={{ initial: seo, imageUrl: seo.image ? mediaUrl(seo.image.key) : undefined, fallback: { title: `${a.title} · ${site.name}`, description: a.excerpt || a.body, imageUrl: a.cover ? mediaUrl(a.cover.key) : undefined } }}
      siteName={site.name}
      siteHost={siteHost}
      mediaAvailable={mediaAvailable()}
      actions={{ setStatus: setArticleStatusAction, deleteArticle: deleteArticleAction }}
    />
  );
}
