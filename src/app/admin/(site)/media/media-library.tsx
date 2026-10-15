"use client";

import { useRef, useState } from "react";
import { deleteMediaAction, describeMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";
import { Button, Field, Input, Notice, PageHeader, Sheet } from "../../ui";
import { uploadImage } from "./upload";

/**
 * The image grid, following design/admin.html. Used two ways:
 *  - manage: the Images screen, with its own header, storage bar and
 *    upload. Tap an image to describe or remove it.
 *  - pick:   inside the section editor's sheet. Tap an image to use it.
 * Uploading works the same in both; new images appear at the front.
 */
type Pending = { id: string; name: string; error?: string };

export function MediaLibrary({
  initial,
  mode,
  available,
  storage,
  onPick,
}: {
  initial: MediaItem[];
  mode: "manage" | "pick";
  available: boolean;
  storage?: { used: number; limit: number };
  onPick?: (item: MediaItem) => void;
}) {
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const used = (storage?.used ?? 0) + items.reduce((n, m) => n + m.sizeBytes, 0) - initial.reduce((n, m) => n + m.sizeBytes, 0);

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

  const uploadButton = available ? (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" id="image-file" aria-label="Choose images to upload" onChange={(e) => void filesChosen(e.target.files)} />
      <Button type="button" size={mode === "manage" ? "sm" : "md"} className={mode === "pick" ? "w-full" : ""} onClick={() => input.current?.click()}>
        Add images
      </Button>
    </>
  ) : null;

  const grid = (
    <>
      {!available && <Notice error="Images aren't set up on this site yet. Ask us to switch them on." />}

      {pending.length > 0 && (
        <ul className="space-y-1.5 text-[13px]" aria-live="polite">
          {pending.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface px-3.5 py-2.5">
              <span className="truncate">{p.name}</span>
              {p.error ? (
                <button type="button" onClick={() => setPending((xs) => xs.filter((x) => x.id !== p.id))} className="text-alert underline-offset-4 hover:underline">
                  {p.error} — dismiss
                </button>
              ) : (
                <span className="text-muted">Uploading…</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && pending.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
          <p className="text-[15px] font-medium">No images yet</p>
          <p className="mt-1 text-[13px] text-muted">Add some from your phone or computer. Big photos are shrunk before they&apos;re sent.</p>
        </div>
      ) : (
        <ul className={`grid gap-2.5 ${mode === "pick" ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`} data-testid="image-grid">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => (mode === "pick" ? onPick?.(m) : setOpen(m))}
                className="block aspect-[4/3] w-full overflow-hidden rounded-card border border-line bg-surface hover:border-line-strong"
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
    </>
  );

  if (mode === "pick") return <div className="space-y-4">{uploadButton}{grid}</div>;

  return (
    <>
      <PageHeader title="Images" back="/" actions={uploadButton} />
      <div className="space-y-5 pt-5 md:pt-6">
        {storage && <StorageBar used={used} limit={storage.limit} />}
        {grid}
      </div>
    </>
  );
}

/** "STORAGE — 1.8 of 5 GB", with a thin bar. */
function StorageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label">Storage</span>
        <span className="font-mono text-[12px] text-muted">
          {fmtBytes(used)} of {fmtBytes(limit)}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-line-soft">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }} />
      </div>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) {
    const gb = n / 1024 ** 3;
    return `${Number.isInteger(gb) || gb >= 10 ? Math.round(gb) : gb.toFixed(1)} GB`;
  }
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
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
      <img src={item.url} alt={item.alt} width={item.width} height={item.height} className="mb-3 w-full rounded-card border border-line" />
      <p className="mb-5 truncate font-mono text-[12px] text-muted">
        {item.filename} · {item.width}×{item.height} · {fmtBytes(item.sizeBytes)}
      </p>
      <Field label="Describe this photo" htmlFor="alt" hint="Read out to people who can't see it, and used by search engines.">
        <Input id="alt" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. Our shop front on a sunny day" />
      </Field>
      <div className="mt-5 flex items-center gap-2.5">
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
