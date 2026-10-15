import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { listArticles } from "@/modules/articles/server";
import { mediaUrl } from "@/modules/media/server";
import { Card, Chips, PageHeader, Pill } from "../../ui";
import { CONTENT_TABS } from "../content-tabs";
import { AddArticle } from "./add-article";

export const dynamic = "force-dynamic";

/** Content → Articles: the journal, newest first, with cover, status and date. */
export default async function ArticlesPage() {
  const { user, site } = await requireSiteAccess();
  const all = await listArticles({ actorId: user.id, siteId: site.id });
  const date = (d: Date | null) => (d ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <>
      <PageHeader title="Content" back="/" actions={<AddArticle />} />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Content" current="/articles" items={CONTENT_TABS} />
        <p className="label mb-2.5 mt-5">Articles</p>
        {all.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No articles yet</p>
            <p className="mt-1 text-[13px] text-muted">Articles are the journal on your site: news, stories, how-tos. Add article is at the top.</p>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {all.map((a) => {
              const cover = a.cover ? mediaUrl(a.cover.key) : "";
              return (
                <li key={a.id}>
                  <Link href={`/articles/${a.id}`} data-testid={`article-${a.slug}`} className="block">
                    <Card className="flex gap-3 p-[14px] hover:bg-hover">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                        <img src={cover} alt="" className="h-16 w-16 flex-none rounded object-cover" />
                      ) : (
                        <span className="h-16 w-16 flex-none rounded bg-sunken" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2.5">
                          <span className="truncate text-[15px] font-medium">{a.title}</span>
                          {a.status === "published" ? <Pill tone="success">Live</Pill> : <Pill tone="neutral">Draft</Pill>}
                        </span>
                        <span className="mt-1.5 block font-mono text-[12.5px] text-muted">/journal/{a.slug}</span>
                        <span className="mt-1.5 block text-[12px] text-muted">
                          {a.publishedAt ? date(a.publishedAt) : `Edited ${timeAgo(a.updatedAt)}`}
                        </span>
                      </span>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
