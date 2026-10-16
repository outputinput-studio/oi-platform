"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveArticleAction } from "@/modules/articles/actions";
import type { ImageRef } from "@/modules/pages/registry";
import { slugFromTitle } from "@/modules/pages/slug";
import type { Seo } from "@/modules/pages/seo";
import Link from "next/link";
import { Button, Field, Input, Label, PageHeader, Select, Textarea } from "../../../ui";
import { SeoCard } from "../../seo-card";
import { ImagePicker } from "../../pages/[id]/image-picker";

/**
 * The article editor, as in design/admin.html: title, cover, body,
 * excerpt, date, author, then the address and publishing. Everything
 * autosaves a moment after a change; the header shows one Saved /
 * Saving… / Retry. On a laptop the article as readers will see it sits
 * on the right, reloaded after each save.
 */
type Draft = {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover?: ImageRef;
  author: string;
  publishedOn: string;
  categoryId: string | null;
  categoryIds: string[];
};

export function ArticleEditor({
  article,
  siteName,
  siteHost,
  mediaAvailable,
  seo,
  categories,
  actions,
}: {
  article: Draft & { id: string; coverUrl?: string; live: boolean; path: string };
  categories: { id: string; name: string; slug: string }[];
  seo: { initial: Seo; imageUrl?: string; fallback: { title: string; description: string; imageUrl?: string } };
  siteName: string;
  siteHost: string;
  mediaAvailable: boolean;
  actions: { setStatus: (f: FormData) => Promise<void>; deleteArticle: (f: FormData) => Promise<void> };
}) {
  const [d, setD] = useState<Draft>(article);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Draft>>({});

  const save = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setStatus("saving");
    const edit = { ...patch, cover: patch.cover === undefined ? undefined : (patch.cover ?? null) };
    const r = await saveArticleAction(article.id, edit).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      pending.current = { ...patch, ...pending.current };
      setError(r.error);
      setStatus("error");
    } else {
      setStatus("saved");
      setVersion((v) => v + 1);
    }
  }, [article.id]);

  const change = (patch: Partial<Draft>) => {
    setD((cur) => ({ ...cur, ...patch }));
    pending.current = { ...pending.current, ...patch };
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const [slugTouched, setSlugTouched] = useState(article.slug !== slugFromTitle(article.title));
  const mainCat = categories.find((c) => c.id === d.categoryId);
  const path = mainCat ? `/journal/${mainCat.slug}/${d.slug || "…"}` : `/journal/${d.slug || "…"}`;

  return (
    <>
      <PageHeader
        title="Edit article"
        back="/articles"
        actions={
          <>
            <span data-testid="article-save-status" className={`text-[13px] ${status === "error" ? "text-alert" : status === "saved" ? "text-success" : "text-muted"}`}>
              {status === "saving" && "Saving…"}
              {status === "saved" && "✓ Saved"}
              {status === "error" && (
                <button type="button" onClick={() => void save()} className="underline underline-offset-4">
                  Retry — {error}
                </button>
              )}
            </span>
            <form action={actions.setStatus} className="flex items-center gap-2">
              <input type="hidden" name="articleId" value={article.id} />
              <input type="hidden" name="status" value={article.live ? "draft" : "published"} />
              <span data-testid="article-status" className="sr-only">
                {article.live ? "Live" : "Draft"}
              </span>
              <Button type="submit" size="sm" variant={article.live ? "secondary" : "primary"}>
                {article.live ? "Unpublish" : "Publish"}
              </Button>
            </form>
          </>
        }
      />
      <div className="pt-5 md:grid md:grid-cols-[480px_minmax(0,1fr)] md:items-start md:gap-8 md:pt-6">
        <div className="space-y-5">
          <Field label="Title" htmlFor="a-title">
            <Input
              id="a-title"
              value={d.title}
              maxLength={160}
              onChange={(e) => {
                const title = e.target.value;
                change(slugTouched || article.live ? { title } : { title, slug: slugFromTitle(title) });
              }}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-[13.5px] text-body">Cover image</p>
            <ImagePicker
              id="a-cover"
              value={d.cover}
              url={article.coverUrl}
              available={mediaAvailable}
              onChange={(next) => change({ cover: next })}
            />
          </div>
          <Field label="Body" htmlFor="a-body" hint="Leave an empty line between paragraphs.">
            <Textarea id="a-body" value={d.body} rows={14} onChange={(e) => change({ body: e.target.value })} />
          </Field>
          <Field label="Excerpt" htmlFor="a-excerpt" hint="Shown in the journal list and when the link is shared.">
            <Textarea id="a-excerpt" value={d.excerpt} rows={2} maxLength={300} onChange={(e) => change({ excerpt: e.target.value })} />
          </Field>
          <Field label="Publish date" htmlFor="a-date" hint="Shown on the article and sets its place in the journal. Set for you when it first goes live.">
            <Input id="a-date" type="date" value={d.publishedOn} onChange={(e) => change({ publishedOn: e.target.value })} />
          </Field>
          <Field label="Written by" htmlFor="a-author" hint={`Shows under the title. ${siteName} unless you put a person here.`}>
            <Input id="a-author" value={d.author} maxLength={80} placeholder={siteName} onChange={(e) => change({ author: e.target.value })} />
          </Field>

          <Label className="mt-9" right={<Link href="/articles/categories" className="text-accent-text">Manage</Link>}>
            Categories
          </Label>
          <div className="space-y-4 rounded-card border border-line bg-surface p-4">
            {categories.length === 0 ? (
              <p className="text-[13.5px] text-muted">
                No categories yet. Grouping articles gives Google a page per subject.{" "}
                <Link href="/articles/categories" className="text-accent-text underline underline-offset-4">
                  Add one
                </Link>
                .
              </p>
            ) : (
              <>
                <Field label="Main category" htmlFor="a-category" hint="Sets this article's web address.">
                  <Select
                    id="a-category"
                    value={d.categoryId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      change({ categoryId: id, categoryIds: d.categoryIds.filter((x) => x !== id) });
                    }}
                  >
                    <option value="">None — straight under /journal</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {categories.length > 1 && (
                  <fieldset>
                    <legend className="mb-1.5 text-[13.5px] text-body">Also shows under</legend>
                    <div className="flex flex-wrap gap-2">
                      {categories
                        .filter((c) => c.id !== d.categoryId)
                        .map((c) => {
                          const on = d.categoryIds.includes(c.id);
                          return (
                            <label key={c.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-text bg-text text-bg" : "border-line text-body hover:bg-hover"}`}>
                              <input type="checkbox" className="sr-only" checked={on} onChange={(e) => change({ categoryIds: e.target.checked ? [...d.categoryIds, c.id] : d.categoryIds.filter((x) => x !== c.id) })} />
                              {c.name}
                            </label>
                          );
                        })}
                    </div>
                  </fieldset>
                )}
              </>
            )}
          </div>

          <Label className="mt-9">Address</Label>
          <div className="rounded-card border border-line bg-surface p-4">
            <Field label="Web address" htmlFor="a-slug" hint={`${siteHost}${path}`}>
              <Input
                id="a-slug"
                value={d.slug}
                maxLength={80}
                className="font-mono"
                onChange={(e) => {
                  setSlugTouched(true);
                  change({ slug: e.target.value });
                }}
              />
            </Field>
            {article.live && <p className="mt-2 text-[12.5px] text-warning">It&apos;s live: changing the address breaks any link already shared.</p>}
          </div>

          <div className="mt-6">
            <SeoCard
              initial={seo.initial}
              imageUrl={seo.imageUrl}
              fallback={seo.fallback}
              host={siteHost}
              path={path}
              mediaAvailable={mediaAvailable}
              onSave={(s) => saveArticleAction(article.id, { seo: s })}
            />
          </div>

          <Label className="mt-9">Article settings</Label>
          <form action={actions.deleteArticle} className="rounded-card border border-line bg-surface p-4">
            <input type="hidden" name="articleId" value={article.id} />
            <Button type="submit" variant="danger" size="sm">
              Delete this article
            </Button>
            <p className="mt-2 text-[12.5px] text-muted">It comes off the site straight away. We keep a copy, so ask us if you need it back.</p>
          </form>
        </div>

        <aside className="hidden md:sticky md:top-6 md:block" aria-label="Preview">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="label">Preview</span>
            <span className="h-px flex-1 bg-line-soft" />
            <span className="text-[11.5px] text-muted">Updates as you save</span>
          </div>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex h-[34px] items-center gap-2 border-b border-line bg-sunken px-3">
              <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
              <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
              <span className="h-[7px] w-[7px] rounded-full bg-line-strong" />
              <span className="min-w-0 flex-1 truncate text-center font-mono text-[11px] text-muted">
                {siteHost}
                {path}
              </span>
            </div>
            <iframe key={version} title="Preview" data-testid="preview" src={`/preview/article/${article.id}`} className="block h-[640px] w-full bg-panel" />
          </div>
        </aside>
      </div>
    </>
  );
}
