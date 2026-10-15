"use client";

import { useState } from "react";
import { SECTION_GROUPS, SECTION_TYPES, sectionTypes, type SectionGroup, type SectionType } from "@/modules/pages/registry";
import { Button, Sheet } from "../../../ui";

/**
 * "Add section" opens a sheet listing the section types in groups, as in
 * design/admin.html: an icon, the name, what it's for. Picking one
 * submits a plain form to the server action; no client state survives it.
 */
export function AddSection({ pageId, action }: { pageId: string; action: (form: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const groups = Object.keys(SECTION_GROUPS) as SectionGroup[];
  return (
    <>
      <Button type="button" variant="quiet" className="w-full" onClick={() => setOpen(true)}>
        + Add section
      </Button>
      {open && (
        <Sheet title="Add a section" onClose={() => setOpen(false)}>
          <p className="-mt-2 mb-4 text-[13.5px] text-muted">Pick what goes on the page. You fill in the boxes.</p>
          {groups.map((g) => (
            <div key={g} className="mb-5">
              <p className="label mb-2">{SECTION_GROUPS[g]}</p>
              <ul className="space-y-2">
                {SECTION_TYPES.filter((t) => sectionTypes[t].group === g).map((t) => (
                  <li key={t}>
                    <form
                      action={async (fd) => {
                        setOpen(false);
                        await action(fd);
                      }}
                    >
                      <input type="hidden" name="pageId" value={pageId} />
                      <input type="hidden" name="type" value={t} />
                      <button type="submit" className="flex w-full items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 text-left hover:bg-hover">
                        <span className="flex w-6 flex-none items-center justify-center text-body">
                          <TypeIcon type={t} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px]">{sectionTypes[t].label}</span>
                          <span className="block text-[12.5px] text-muted">{sectionTypes[t].description}</span>
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}

function TypeIcon({ type }: { type: SectionType }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (type) {
    case "text":
      return (
        <svg {...p}>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      );
    case "statement":
      return (
        <svg {...p}>
          <path d="M7 8h10M5 12h14M8 16h8" />
        </svg>
      );
    case "questions":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" />
        </svg>
      );
    case "hero":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 15l5-4 4 3 4-5 5 6" />
        </svg>
      );
    case "form":
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="4" rx="1" />
          <rect x="4" y="12" width="16" height="4" rx="1" />
          <path d="M4 20h8" />
        </svg>
      );
    case "pictureAndWords":
      return (
        <svg {...p}>
          <rect x="3" y="6" width="8" height="12" rx="1.5" />
          <path d="M14 8h7M14 12h7M14 16h5" />
        </svg>
      );
  }
}
