"use client";

import { useState } from "react";
import { CONSENT_COOKIE, CONSENT_DAYS, gaSnippet, gaSrc, pixelSnippet, type Analytics } from "@/modules/sites/tracking";

/**
 * The cookie notice (Settings · Cookie notice). Accept or Decline is kept a
 * year on this address; Accept loads analytics there and then, so nobody
 * has to reload. Decline means they never load.
 */
export function CookieNotice({ message, policyPath, analytics }: { message: string; policyPath: string; analytics: Analytics | null }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const answer = (yes: boolean) => {
    document.cookie = `${CONSENT_COOKIE}=${yes ? "yes" : "no"}; path=/; max-age=${CONSENT_DAYS * 86_400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    if (yes && analytics) load(analytics);
    setOpen(false);
  };
  return (
    <div
      role="region"
      aria-label="Cookies"
      data-testid="cookie-notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4 text-[14.5px] leading-[1.5] text-[var(--text-body)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] md:left-auto md:right-5 md:mx-0"
    >
      <p>
        {message}
        {policyPath && (
          <>
            {" "}
            <a href={policyPath} className="text-[var(--text)] underline underline-offset-4">
              Read more
            </a>
          </>
        )}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => answer(true)} className="h-10 rounded-[6px] bg-[var(--accent)] px-5 text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90">
          Accept
        </button>
        <button type="button" onClick={() => answer(false)} className="h-10 rounded-[6px] border border-[var(--border)] px-5 text-[15px] text-[var(--text)] hover:bg-[var(--bg)]">
          Decline
        </button>
      </div>
    </div>
  );
}

function load(a: Analytics) {
  const add = (attrs: { src?: string; text?: string }) => {
    const s = document.createElement("script");
    if (attrs.src) {
      s.src = attrs.src;
      s.async = true;
    }
    if (attrs.text) s.text = attrs.text;
    document.body.appendChild(s);
  };
  if (a.gaId) {
    add({ src: gaSrc(a.gaId) });
    add({ text: gaSnippet(a.gaId) });
  }
  if (a.metaPixelId) add({ text: pixelSnippet(a.metaPixelId) });
}
