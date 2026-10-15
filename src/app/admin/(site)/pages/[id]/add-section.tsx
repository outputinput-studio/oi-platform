"use client";

import { useState } from "react";
import { SECTION_TYPES, sectionTypes } from "@/modules/pages/registry";
import { Button } from "../../../ui";

/**
 * "Add section" opens a sheet anchored to the bottom of the screen on a
 * phone (side on a laptop) listing the section types. Picking one submits
 * a plain form to the server action; no client state survives it.
 */
export function AddSection({ pageId, action }: { pageId: string; action: (form: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="quiet" className="w-full" onClick={() => setOpen(true)}>
        + Add section
      </Button>
      {open && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/60 md:items-stretch md:justify-end" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Add a section"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-lg border border-[var(--border)] bg-[var(--bg)] p-4 md:h-full md:max-h-none md:w-96 md:rounded-none md:border-y-0 md:border-r-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium">Add a section</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-[var(--muted)]">
                Close
              </button>
            </div>
            <ul className="space-y-2">
              {SECTION_TYPES.map((t) => (
                <li key={t}>
                  <form
                    action={async (fd) => {
                      setOpen(false);
                      await action(fd);
                    }}
                  >
                    <input type="hidden" name="pageId" value={pageId} />
                    <input type="hidden" name="type" value={t} />
                    <button
                      type="submit"
                      className="block w-full rounded-md border border-[var(--border)] p-3 text-left hover:border-[var(--accent)]"
                    >
                      <span className="block text-base">{sectionTypes[t].label}</span>
                      <span className="block text-sm text-[var(--muted)]">{sectionTypes[t].description}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
