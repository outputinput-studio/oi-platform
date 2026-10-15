"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};
/** True once we're in the browser, false on the server render. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * A bottom sheet on a phone, a panel on the right on a laptop. Rendered
 * at the end of <body> so it sits above everything, whatever opened it.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  if (!useMounted()) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end bg-black/60 md:items-stretch md:justify-end" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-[14px] border border-line bg-panel px-4 pb-6 pt-2 md:h-full md:max-h-none md:w-[440px] md:rounded-none md:border-y-0 md:border-r-0 md:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-[13.5px] text-muted hover:text-text">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
