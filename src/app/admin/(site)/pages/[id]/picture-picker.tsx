"use client";

import { useState } from "react";
import { listMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";
import type { ImageRef } from "@/modules/pages/registry";
import { Button, Field, Input, Notice } from "../../../ui";
import { MediaLibrary, Sheet } from "../../media/media-library";

/**
 * The picture slot in a section: the current picture (or none), a button
 * to choose one from the library (or upload a new one), and "Describe
 * this photo". The section stores a reference to the library, never the
 * picture itself.
 */
export function PicturePicker({
  id,
  value,
  url,
  available,
  onChange,
}: {
  id: string;
  value: ImageRef | undefined;
  /** The current picture's address, worked out on the server. */
  url: string | undefined;
  available: boolean;
  onChange: (next: ImageRef | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string>();
  // Freshly picked pictures carry their address; stored ones get it from the server.
  const [pickedUrl, setPickedUrl] = useState<string>();
  const src = pickedUrl ?? url;

  async function openSheet() {
    setOpen(true);
    if (items) return;
    const r = await listMediaAction();
    if (r.ok) setItems(r.value);
    else setError(r.error);
  }

  function pick(item: MediaItem) {
    setPickedUrl(item.url);
    onChange({ key: item.key, alt: value?.alt || item.alt, width: item.width, height: item.height });
    setOpen(false);
  }

  return (
    <div className="space-y-3" data-testid="picture-picker">
      {value && src ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" width={value.width} height={value.height} className="h-24 w-24 flex-none rounded-md border border-[var(--border)] object-cover" />
          <div className="flex flex-col gap-2">
            <Button type="button" variant="quiet" onClick={() => void openSheet()}>
              Change picture
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setPickedUrl(undefined);
                onChange(undefined);
              }}
            >
              Remove picture
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="quiet" onClick={() => void openSheet()}>
          Choose a picture
        </Button>
      )}
      {value && (
        <Field label="Describe this photo" htmlFor={`${id}-alt`}>
          <Input
            id={`${id}-alt`}
            value={value.alt}
            maxLength={300}
            placeholder="e.g. Our shop front on a sunny day"
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
        </Field>
      )}
      {open && (
        <Sheet title="Choose a picture" onClose={() => setOpen(false)}>
          {error && <Notice error={error} />}
          {items ? (
            <MediaLibrary initial={items} mode="pick" available={available} onPick={pick} />
          ) : (
            !error && <p className="text-sm text-[var(--muted)]">Loading…</p>
          )}
        </Sheet>
      )}
    </div>
  );
}
