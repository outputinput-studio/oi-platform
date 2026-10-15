import { requireSiteAccess } from "@/modules/auth/access";
import { getArticle } from "@/modules/articles/server";
import { ArticleBody } from "@/app/site/article";
import { Frame, storefrontMenu } from "@/app/site/storefront";

export const dynamic = "force-dynamic";

/** The article as readers will see it, draft included, for the editor's preview pane. Members only. */
export default async function ArticlePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const [a, menu] = await Promise.all([getArticle({ actorId: user.id, siteId: site.id, articleId: id }), storefrontMenu(site.id)]);
  return (
    <Frame site={site} menu={menu} current="journal" preview>
      <ArticleBody article={a} site={site} preview />
    </Frame>
  );
}
