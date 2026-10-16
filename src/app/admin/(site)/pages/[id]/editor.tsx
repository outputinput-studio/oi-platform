"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reorderSectionsAction, savePageSeoAction, savePageTitleAction } from "@/modules/pages/actions";
import type { Seo } from "@/modules/pages/seo";
import { SeoCard } from "../../seo-card";
import { SortableItem, SortableList } from "../../../sortable";
import { sectionSummary, sectionTypes, type SectionType } from "@/modules/pages/registry";
import { Button, Input, Label, PageHeader } from "../../../ui";
import { AddSection } from "./add-section";
import { PageSettingsForm } from "./page-settings-form";
import { SectionEditor, type Status } from "./section-editor";

/**
 * The page editor, as in design/admin.html. Everything on it autosaves
 * except the address: the header shows one Saved / Saving… / Retry for
 * the whole page, worked out from every field that saves on its own.
 *
 * Sections are cards that fold up to their type and first line. The first
 * starts open, the rest folded; a section you've just added opens itself.
 */
export type EditorSection = { id: string; type: SectionType; data: unknown; imageUrl?: string };
export type FormOption = { id: string; name: string };

export function Editor({
  page,
  sections,
  isHome,
  live,
  mediaAvailable,
  forms,
  siteUrl,
  seo,
  actions,
}: {
  page: { id: string; title: string; slug: string };
  sections: EditorSection[];
  isHome: boolean;
  live: boolean;
  mediaAvailable: boolean;
  /** The site's forms, for the Form section to pick from. */
  forms: FormOption[];
  /** The page's public address, shown in the preview's chrome. */
  siteUrl: string;
  seo: { initial: Seo; imageUrl?: string; fallback: { title: string; description: string; imageUrl?: string }; host: string; path: string };
  actions: {
    setStatus: (form: FormData) => Promise<void>;
    addSection: (form: FormData) => Promise<void>;
    moveSection: (form: FormData) => Promise<void>;
    removeSection: (form: FormData) => Promise<void>;
    deletePage: (form: FormData) => Promise<void>;
  };
}) {
  // ── one save status for the page ──────────────────────────────
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const report = useCallback((id: string, s: Status) => setStatuses((m) => ({ ...m, [id]: s })), []);
  const all = Object.values(statuses);
  const overall: Status = all.some((s) => s.kind === "saving")
    ? { kind: "saving" }
    : (all.find((s) => s.kind === "error") ?? (all.some((s) => s.kind === "saved") ? { kind: "saved" } : { kind: "idle" }));

  // ── the order, held locally so a drag lands at once and the server catches up ──
  const [order, setOrder] = useState<string[]>(() => sections.map((s) => s.id));
  const serverOrder = sections.map((s) => s.id).join(",");
  const lastServerOrder = useRef(serverOrder);
  useEffect(() => {
    if (lastServerOrder.current !== serverOrder) {
      lastServerOrder.current = serverOrder;
      setOrder(sections.map((s) => s.id));
    }
  }, [serverOrder, sections]);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)).filter((s): s is EditorSection => !!s);
  const reorder = async (next: string[]) => {
    const before = order;
    setOrder(next);
    report("order", { kind: "saving" });
    const r = await reorderSectionsAction(page.id, next).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setOrder(before);
      report("order", { kind: "error", message: r.error });
    } else report("order", { kind: "saved" });
  };

  // ── which sections are open ───────────────────────────────────
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections[0] ? [sections[0].id] : []));
  const known = useRef(new Set(sections.map((s) => s.id)));
  useEffect(() => {
    const fresh = sections.filter((s) => !known.current.has(s.id));
    if (fresh.length) {
      setOpen((o) => new Set([...o, ...fresh.map((s) => s.id)]));
      for (const s of fresh) known.current.add(s.id);
    }
  }, [sections]);
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ── the preview reloads after every save and every structural change ──
  const [previewVersion, setPreviewVersion] = useState(0);
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && overall.kind === "saved") setPreviewVersion((v) => v + 1);
    wasSaving.current = overall.kind === "saving";
  }, [overall.kind]);
  const shape = sections.map((s) => s.id).join(",");
  const lastShape = useRef(shape);
  useEffect(() => {
    if (lastShape.current !== shape) {
      lastShape.current = shape;
      setPreviewVersion((v) => v + 1);
    }
  }, [shape]);

  return (
    <>
      <PageHeader
        title="Edit page"
        back="/pages"
        actions={
          <>
            <SaveStatus status={overall} />
            <form action={actions.setStatus} className="flex items-center gap-2">
              <input type="hidden" name="pageId" value={page.id} />
              <input type="hidden" name="status" value={live ? "draft" : "published"} />
              <span data-testid="page-status" className="sr-only">
                {live ? "Live" : "Draft"}
              </span>
              <Button type="submit" size="sm" variant={live ? "secondary" : "primary"}>
                {live ? "Unpublish" : "Publish"}
              </Button>
            </form>
          </>
        }
      />

      <div className="pt-5 md:grid md:grid-cols-[480px_minmax(0,1fr)] md:items-start md:gap-8 md:pt-6">
      <div>
        <TitleField pageId={page.id} initial={page.title} onStatus={report} />
        <p className="mt-2 font-mono text-[12.5px] text-muted">{isHome ? "the front page" : `/${page.slug}`}</p>

        <Label className="mt-7" right={sections.length > 1 ? "Drag to reorder" : undefined}>
          Sections
        </Label>
        <section className="space-y-2.5" aria-label="Sections">
          {sections.length === 0 && (
            <p className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13.5px] text-muted">
              This page is empty. Add a section to begin.
            </p>
          )}
          <SortableList ids={order} onReorder={(next) => void reorder(next)} onDragStart={() => setOpen(new Set())}>
          {ordered.map((s, i) => (
            <SortableItem key={s.id} id={s.id}>
              {({ handle }) => (
            <SectionCard
              index={i}
              count={sections.length}
              handle={handle}
              section={s}
              pageId={page.id}
              open={open.has(s.id)}
              onToggle={() => toggle(s.id)}
              onStatus={report}
              mediaAvailable={mediaAvailable}
              forms={forms}
              actions={actions}
            />
              )}
            </SortableItem>
          ))}
          </SortableList>
          <AddSection pageId={page.id} action={actions.addSection} />
        </section>

        <div className="mt-6">
          <SeoCard
            initial={seo.initial}
            imageUrl={seo.imageUrl}
            fallback={seo.fallback}
            host={seo.host}
            path={seo.path}
            mediaAvailable={mediaAvailable}
            onSave={(s) => savePageSeoAction(page.id, s)}
          />
        </div>

        <Label className="mt-9">Page settings</Label>
        <div className="space-y-5 rounded-card border border-line bg-surface p-4">
          <PageSettingsForm pageId={page.id} slug={page.slug} isHome={isHome} />
          {!isHome && (
            <form action={actions.deletePage} className="border-t border-line-soft pt-4">
              <input type="hidden" name="pageId" value={page.id} />
              <Button type="submit" variant="danger" size="sm">
                Delete this page
              </Button>
              <p className="mt-2 text-[12.5px] text-muted">It comes off the site straight away. We keep a copy, so ask us if you need it back.</p>
            </form>
          )}
        </div>
      </div>
      <Preview pageId={page.id} url={siteUrl} version={previewVersion} />
      </div>
    </>
  );
}

/**
 * The page as visitors will see it, beside the editor on a laptop. It's
 * the real storefront, rendered at /preview/<id> for signed-in members,
 * reloaded after each save. On a phone there's no room; the page itself
 * is a tap away once it's live.
 */
function Preview({ pageId, url, version }: { pageId: string; url: string; version: number }) {
  return (
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
          <span className="min-w-0 flex-1 truncate text-center font-mono text-[11px] text-muted">{url}</span>
        </div>
        <iframe
          key={version}
          title="Preview"
          data-testid="preview"
          src={`/preview/${pageId}`}
          className="block h-[640px] w-full bg-panel"
        />
      </div>
    </aside>
  );
}

function SaveStatus({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  return (
    <span data-testid="page-save-status" className={`text-[13px] ${status.kind === "error" ? "text-alert" : status.kind === "saved" ? "text-success" : "text-muted"}`}>
      {status.kind === "saving" && "Saving…"}
      {status.kind === "saved" && "✓ Saved"}
      {status.kind === "error" && "Not saved"}
    </span>
  );
}

/** The page title, autosaved a moment after typing stops. */
function TitleField({ pageId, initial, onStatus }: { pageId: string; initial: string; onStatus: (id: string, s: Status) => void }) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = async (v: string) => {
    onStatus("title", { kind: "saving" });
    try {
      const r = await savePageTitleAction(pageId, v);
      onStatus("title", r.error ? { kind: "error", message: r.error } : { kind: "saved" });
    } catch {
      onStatus("title", { kind: "error", message: "couldn't reach the server" });
    }
  };
  return (
    <div>
      <label htmlFor="page-title" className="label mb-2 block">
        Page title
      </label>
      <Input
        id="page-title"
        value={value}
        maxLength={120}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void save(e.target.value), 700);
        }}
      />
    </div>
  );
}

function SectionCard({
  index,
  count,
  handle,
  section,
  pageId,
  open,
  onToggle,
  onStatus,
  mediaAvailable,
  forms,
  actions,
}: {
  index: number;
  count: number;
  handle: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref: (el: HTMLElement | null) => void };
  section: EditorSection;
  pageId: string;
  open: boolean;
  onToggle: () => void;
  onStatus: (id: string, s: Status) => void;
  mediaAvailable: boolean;
  forms: FormOption[];
  actions: { moveSection: (f: FormData) => Promise<void>; removeSection: (f: FormData) => Promise<void> };
}) {
  const [menu, setMenu] = useState(false);
  const label = sectionTypes[section.type]?.label ?? section.type;
  const summary = sectionSummary(section.type, section.data);

  return (
    <article data-testid={`section-${index}`} className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-1 pr-2">
        <button type="button" {...handle} className="flex h-11 w-10 flex-none cursor-grab touch-none items-center justify-center rounded-button text-faint hover:bg-hover hover:text-text active:cursor-grabbing">
          <DragGlyph />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="label block !text-[10.5px]">{label}</span>
            {!open && summary && <span className="mt-0.5 block truncate text-[15px]">{summary}</span>}
          </span>
        </button>
        <div className="relative">
          <button type="button" aria-label="Section menu" aria-haspopup="menu" onClick={() => setMenu((m) => !m)} className="flex h-9 w-9 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text">
            <DotsGlyph />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div role="menu" className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-card border border-line bg-panel py-1 shadow-[0_8px_24px_var(--shadow)]">
                <form action={actions.moveSection} onSubmit={() => setMenu(false)}>
                  <input type="hidden" name="pageId" value={pageId} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="direction" value="up" />
                  <MenuItem disabled={index === 0}>Move up</MenuItem>
                </form>
                <form action={actions.moveSection} onSubmit={() => setMenu(false)}>
                  <input type="hidden" name="pageId" value={pageId} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="direction" value="down" />
                  <MenuItem disabled={index === count - 1}>Move down</MenuItem>
                </form>
                <form action={actions.removeSection} onSubmit={() => setMenu(false)} className="border-t border-line-soft">
                  <input type="hidden" name="pageId" value={pageId} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <MenuItem tone="alert">Remove section</MenuItem>
                </form>
              </div>
            </>
          )}
        </div>
        <button type="button" onClick={onToggle} aria-label={open ? "Fold up" : "Open"} className="flex h-9 w-9 items-center justify-center rounded-button text-muted hover:bg-hover hover:text-text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={open ? "rotate-180" : ""} aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-t border-line-soft px-4 pb-4 pt-4">
          <SectionEditor sectionId={section.id} type={section.type} initial={section.data} imageUrl={section.imageUrl} mediaAvailable={mediaAvailable} forms={forms} onStatus={onStatus} />
        </div>
      )}
    </article>
  );
}

function MenuItem({ children, disabled, tone }: { children: React.ReactNode; disabled?: boolean; tone?: "alert" }) {
  return (
    <button
      type="submit"
      role="menuitem"
      disabled={disabled}
      className={`block w-full px-4 py-2.5 text-left text-[14px] hover:bg-hover disabled:opacity-40 ${tone === "alert" ? "text-alert" : "text-text"}`}
    >
      {children}
    </button>
  );
}

function DragGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none" aria-hidden>
      <path d="M5 9h14M5 15h14" />
    </svg>
  );
}
function DotsGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}
