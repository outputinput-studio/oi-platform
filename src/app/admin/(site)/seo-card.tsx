"use client";

import { useEffect, useRef, useState } from "react";
import type { Seo } from "@/modules/pages/seo";
import { summarise } from "@/modules/pages/seo";
import { Field, Input, Switch, Textarea } from "../ui";
import { ImagePicker } from "./pages/[id]/image-picker";
import { FieldErrors } from "@/lib/field-errors";

/**
 * "Search and sharing", as in design/admin.html: a fold-out card with a
 * preview of the Google result, the search title and description with
 * their counts, the sharing image, and "hide from search engines".
 * Autosaves a moment after a change; the owner of the card reports
 * Saved / Saving… the same way as the rest of the editor.
 */
export function SeoCard({
  initial,
  fallback,
  host,
  path,
  imageUrl,
  mediaAvailable,
  onSave,
}: {
  initial: Seo;
  /** What's used when the fields are empty: the page's own title, first words, cover. */
  fallback: { title: string; description: string; imageUrl?: string };
  host: string;
  path: string;
  /** The current sharing image's address, when one is set. */
  imageUrl?: string;
  mediaAvailable: boolean;
  onSave: (seo: Seo) => Promise<{ ok?: string; error?: string; fields?: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  const [seo, setSeo] = useState<Seo>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<string[]>();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (snapshot: Seo) => {
    setStatus("saving");
    const r = await onSave(snapshot).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setError(r.error);
      setFields("fields" in r ? r.fields : undefined);
      setStatus("error");
    } else setStatus("saved");
  };
  const change = (patch: Partial<Seo>) => {
    const next = { ...seo, ...patch };
    setSeo(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const shownTitle = seo.title || fallback.title;
  const shownDescription = seo.description || summarise(fallback.description) || "Add a description so people know what's on the page.";

  return (
    <div data-testid="seo-card" className="rounded-card border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-[15px] text-left hover:bg-hover first:rounded-t-card">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px]">Search and sharing</span>
          <span className="mt-0.5 block text-[12px] text-muted">How this looks in Google and when shared{seo.noindex ? " · hidden from search" : ""}</span>
        </span>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`flex-none text-faint ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="space-y-5 border-t border-line-soft px-4 pb-4 pt-4">
          <div>
            <p className="label mb-2">Preview</p>
            <div className="rounded-[6px] border border-line bg-panel p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 flex-none rounded-full border border-control bg-surface" />
                <div className="min-w-0">
                  <p className="text-[11.5px] text-body">{host}</p>
                  <p className="truncate font-mono text-[10.5px] text-muted">{path}</p>
                </div>
              </div>
              <p className="mt-2 text-[15px] leading-[1.35] text-accent-text">{shownTitle}</p>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-muted">{shownDescription}</p>
            </div>
          </div>
          <Field label="Search title" htmlFor="seo-title" hint={`${seo.title.length} / 60 · empty uses "${fallback.title}".`}>
            <Input id="seo-title" data-field="seo.title" value={seo.title} maxLength={120} placeholder={fallback.title} onChange={(e) => change({ title: e.target.value })} />
          </Field>
          <Field label="Search description" htmlFor="seo-description" hint={`${seo.description.length} / 160 · empty uses the first words on the page.`}>
            <Textarea id="seo-description" data-field="seo.description" value={seo.description} rows={3} maxLength={320} onChange={(e) => change({ description: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1.5 text-[13.5px] text-body">Sharing image</p>
            <ImagePicker id="seo-image" value={seo.image ?? undefined} url={imageUrl} available={mediaAvailable} onChange={(next) => change({ image: next ?? null })} />
            <p className="mt-1.5 text-[12.5px] text-muted">{seo.image ? "Shown when the link is shared." : fallback.imageUrl ? "Using the page's own image. Pick one if you want something different when the link is shared." : "Shown when the link is pasted into a chat or a post."}</p>
          </div>
          <Switch checked={seo.noindex} onChange={(v) => change({ noindex: v })} label="Hide from search engines" hint="The page stays live but won't appear in Google." />
          <p className="text-right text-[12px] text-muted" aria-live="polite" data-testid="seo-save-status">
            {status === "saving" && "Saving…"}
            {status === "saved" && "Saved"}
            {status === "error" && (
              <button type="button" onClick={() => void save(seo)} className="text-alert underline underline-offset-4">
                Retry — {error}
              </button>
            )}
            {status === "error" && <FieldErrors fields={fields} />}
          </p>
        </div>
      )}
    </div>
  );
}
