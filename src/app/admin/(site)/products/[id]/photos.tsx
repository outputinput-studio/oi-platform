"use client";

import { useState } from "react";
import { listMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";
import type { ImageRef } from "@/modules/pages/registry";
import { MAX_PHOTOS } from "@/modules/products/catalogue";
import { Input, Notice, Sheet } from "../../../ui";
import { MediaLibrary } from "../../media/media-library";
import { SortableItem, SortableList } from "../../../sortable";

/**
 * A product's photos, as in design/admin.html: drag to reorder, the
 * first is the main one, each can be described for screen readers.
 * Photos come from the library (or are uploaded into it from here);
 * the product keeps references, never the files.
 */
export function Photos({
  value,
  urls,
  available,
  onChange,
}: {
  value: ImageRef[];
  /** Addresses for the photos already saved, worked out on the server. */
  urls: Record<string, string>;
  available: boolean;
  onChange: (next: ImageRef[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const src = (key: string) => picked[key] ?? urls[key] ?? "";
  const undescribed = value.filter((p) => !p.alt.trim()).length;

  async function openSheet() {
    setOpen(true);
    if (items) return;
    const r = await listMediaAction();
    if (r.ok) setItems(r.value);
    else setError(r.error);
  }
  function pick(item: MediaItem) {
    setOpen(false);
    if (value.some((p) => p.key === item.key)) return;
    setPicked((m) => ({ ...m, [item.key]: item.url }));
    onChange([...value, { key: item.key, alt: item.alt, width: item.width, height: item.height }]);
  }

  return (
    <div data-testid="photos">
      {value.length > 0 && (
        <ul className="space-y-2">
          <SortableList ids={value.map((p) => p.key)} onReorder={(order) => onChange(order.map((k) => value.find((p) => p.key === k)!).filter(Boolean))}>
            {value.map((p, i) => (
              <SortableItem key={p.key} id={p.key}>
                {({ handle }) => (
                  <li className="flex items-center gap-2 rounded-card border border-line bg-surface p-2 pr-3">
                    <button type="button" {...handle} className="flex h-11 w-8 flex-none cursor-grab touch-none items-center justify-center rounded-button text-faint hover:bg-hover hover:text-text active:cursor-grabbing">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M5 9h14M5 15h14" />
                      </svg>
                    </button>
                    <span className="relative flex-none">
                      {/* eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket */}
                      <img src={src(p.key)} alt="" className="h-16 w-16 rounded object-cover" />
                      {i === 0 && <span className="absolute bottom-1 left-1 rounded-[3px] bg-bg/85 px-1 font-mono text-[9.5px] uppercase tracking-[0.6px] text-text">Main</span>}
                    </span>
                    <Input
                      aria-label={`Describe photo ${i + 1}`}
                      value={p.alt}
                      maxLength={300}
                      placeholder="Describe this photo"
                      className="!h-10 min-w-0 flex-1 text-[14px]"
                      onChange={(e) => onChange(value.map((x) => (x.key === p.key ? { ...x, alt: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => onChange(value.filter((x) => x.key !== p.key))}
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-button text-muted hover:bg-hover hover:text-alert"
                    >
                      ×
                    </button>
                  </li>
                )}
              </SortableItem>
            ))}
          </SortableList>
        </ul>
      )}
      {value.length < MAX_PHOTOS && (
        <button
          type="button"
          onClick={() => void openSheet()}
          className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-[14.5px] text-body hover:border-accent hover:text-accent-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M5 12h14M12 5v14" />
          </svg>
          Add photo
        </button>
      )}
      <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">Drag to reorder. The first photo is the main one; the second shows when someone hovers over it on a computer.</p>
      {undescribed > 0 && (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-warning">
          {undescribed === 1 ? "One photo has" : `${undescribed} photos have`} no description yet. Add one and anyone using a screen reader can tell what the piece looks like.
        </p>
      )}
      {open && (
        <Sheet title="Add a photo" onClose={() => setOpen(false)}>
          {error && <Notice error={error} />}
          {items ? <MediaLibrary initial={items} mode="pick" available={available} onPick={pick} /> : !error && <p className="text-[13.5px] text-muted">Loading…</p>}
        </Sheet>
      )}
    </div>
  );
}
