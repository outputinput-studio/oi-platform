"use client";

import { useRef, useState } from "react";
import { deleteMediaAction, describeMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";
import { Button, Field, Input, Notice } from "../../ui";
import { uploadImage } from "./upload";

/**
 * The image grid, used two ways:
 *  - manage: the Images page. Tap an image to describe or remove it.
 *  - pick:   inside the section editor. Tap an image to use it.
 * Uploading works the same in both; new images appear at the front.
 */
type Pending = { id: string; name: string; error?: string };

export function MediaLibrary({
  initial,
  mode,
  available,
  onPick,
}: {
  initial: MediaItem[];
  mode: "manage" | "pick";
  available: boolean;
  onPick?: (item: MediaItem) => void;
}) {
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function filesChosen(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list);
    if (input.current) input.current.value = "";
    for (const file of files) {
      const id = crypto.randomUUID();
      setPending((p) => [...p, { id, name: file.name }]);
      try {
        const item = await uploadImage(file);
        setItems((xs) => [item, ...xs]);
        setPending((p) => p.filter((x) => x.id !== id));
        if (mode === "pick" && files.length === 1) onPick?.(item);
      } catch (err) {
        const error = err instanceof Error ? err.message : "Couldn't upload that one.";
        setPending((p) => p.map((x) => (x.id === id ? { ...x, error } : x)));
      }
    }
  }

  return (
    <div className="space-y-4">
      {available ? (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            id="image-file"
            aria-label="Choose images to upload"
            onChange={(e) => void filesChosen(e.target.files)}
          />
          <Button type="button" className="w-full" onClick={() => input.current?.click()}>
            + Add images
          </Button>
        </>
      ) : (
        <Notice error="Images aren't set up on this site yet. Ask us to switch them on." />
      )}

      {pending.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2">
              <span className="truncate">{p.name}</span>
              {p.error ? (
                <button type="button" onClick={() => setPending((xs) => xs.filter((x) => x.id !== p.id))} className="text-[var(--fg)] underline-offset-4 hover:underline">
                  {p.error} — dismiss
                </button>
              ) : (
                <span className="text-[var(--muted)]">Uploading…</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && pending.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          No images yet. Add some from your phone or computer.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-4" data-testid="image-grid">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => (mode === "pick" ? onPick?.(m) : setOpen(m))}
                className="block aspect-square w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]/10 hover:border-[var(--accent)]"
                aria-label={m.alt || m.filename}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails straight from the bucket */}
                <img src={m.url} alt="" width={m.width} height={m.height} loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <ImageSheet
          item={open}
          onClose={() => setOpen(null)}
          onChange={(it) => {
            setItems((xs) => xs.map((x) => (x.id === it.id ? it : x)));
            setOpen(it);
          }}
          onRemoved={(id) => {
            setItems((xs) => xs.filter((x) => x.id !== id));
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

/** One image: describe it, or remove it. */
function ImageSheet({
  item,
  onClose,
  onChange,
  onRemoved,
}: {
  item: MediaItem;
  onClose: () => void;
  onChange: (item: MediaItem) => void;
  onRemoved: (id: string) => void;
}) {
  const [alt, setAlt] = useState(item.alt);
  const [note, setNote] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await describeMediaAction(item.id, alt);
    setBusy(false);
    if (r.ok) {
      onChange(r.value);
      setNote({ ok: "Saved" });
    } else setNote({ error: r.error });
  }

  async function remove() {
    if (!confirm("Remove this image? Pages using it will show no image there.")) return;
    setBusy(true);
    const r = await deleteMediaAction(item.id);
    setBusy(false);
    if (r.ok) onRemoved(item.id);
    else setNote({ error: r.error });
  }

  return (
    <Sheet title="Image" onClose={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt={item.alt} width={item.width} height={item.height} className="mb-4 w-full rounded-md" />
      <p className="mb-4 truncate text-sm text-[var(--muted)]">
        {item.filename} · {item.width}×{item.height}
      </p>
      <Field label="Describe this photo" htmlFor="alt">
        <Input id="alt" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. Our shop front on a sunny day" />
      </Field>
      <p className="mt-1 text-sm text-[var(--muted)]">Read out to people who can&apos;t see it, and used by search engines.</p>
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="danger" onClick={() => void remove()} disabled={busy}>
          Remove
        </Button>
        <Notice {...note} />
      </div>
    </Sheet>
  );
}

/** Bottom sheet on a phone, side panel on a laptop. Same as the add-section sheet. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60 md:items-stretch md:justify-end" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-lg border border-[var(--border)] bg-[var(--bg)] p-4 md:h-full md:max-h-none md:w-[28rem] md:rounded-none md:border-y-0 md:border-r-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--muted)]">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
