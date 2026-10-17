import { z } from "zod";

/**
 * Settings · Analytics and Settings · Cookie notice. Pure: the admin, the
 * storefront and the tests share it.
 *
 * Analytics take an ID, never code (Carl, Oct 2026): a GA4 measurement ID
 * and a Meta pixel ID. Someone who pastes the whole snippet gets the ID
 * pulled out of it. The storefront writes the official snippets itself,
 * with the ID quoted, so nothing typed here can become code.
 *
 * With the cookie notice on, analytics wait for Accept (Carl, Oct 2026):
 * Decline, or no answer yet, means they never load.
 */

const GA = /^G-[A-Z0-9]{4,15}$/;
const PIXEL = /^\d{8,20}$/;

const gaId = z.preprocess(
  (v) => {
    const s = String(v ?? "").trim();
    const m = s.match(/\bG-[A-Z0-9]{4,15}\b/i);
    return m ? m[0].toUpperCase() : s;
  },
  z.string().refine((v) => v === "" || GA.test(v), "A Google Analytics ID looks like G-XXXXXXXXXX. It's in Google Analytics under Admin → Data streams."),
);

const metaPixelId = z.preprocess(
  (v) => {
    const s = String(v ?? "").trim();
    const init = s.match(/fbq\(\s*['"]init['"]\s*,\s*['"](\d{8,20})['"]/);
    if (init) return init[1];
    return PIXEL.test(s) ? s : (s.match(/\b\d{8,20}\b/)?.[0] ?? s);
  },
  z.string().refine((v) => v === "" || PIXEL.test(v), "A Meta pixel ID is a long number, like 1234567890123456. It's in Meta Events Manager."),
);

export const analyticsSchema = z.object({ gaId: gaId.default(""), metaPixelId: metaPixelId.default("") });
export type Analytics = z.infer<typeof analyticsSchema>;

export function readAnalytics(raw: unknown): Analytics {
  const r = analyticsSchema.safeParse(raw ?? {});
  return r.success ? r.data : { gaId: "", metaPixelId: "" };
}

export const DEFAULT_COOKIE_MESSAGE = "We use cookies to see how people find and use this site. You can say no.";

export const cookieNoticeSchema = z.object({
  enabled: z.boolean().default(false),
  message: z.string().trim().max(400, "Keep it under 400 characters.").default(DEFAULT_COOKIE_MESSAGE),
  /** A page on this site, like /privacy. Empty: no link. */
  policyPath: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^\/[a-z0-9/_-]*$/i.test(v), "Pick one of your own pages.")
    .default(""),
});
export type CookieNotice = z.infer<typeof cookieNoticeSchema>;

export function readCookieNotice(raw: unknown): CookieNotice {
  const r = cookieNoticeSchema.safeParse(raw ?? {});
  const n = r.success ? r.data : cookieNoticeSchema.parse({});
  return { ...n, message: n.message || DEFAULT_COOKIE_MESSAGE };
}

/** The visitor's answer, kept a year on the storefront's own address: "yes" or "no". */
export const CONSENT_COOKIE = "oi_consent";
export const CONSENT_DAYS = 365;

/** Whether analytics may load for this visitor. */
export function canTrack(notice: Pick<CookieNotice, "enabled">, consent: string | undefined): boolean {
  return !notice.enabled || consent === "yes";
}

export function gaSrc(id: string): string {
  if (!GA.test(id)) throw new Error("Not a Google Analytics ID.");
  return `https://www.googletagmanager.com/gtag/js?id=${id}`;
}

/** Google's own snippet, with only the ID (checked, then quoted) put in. */
export function gaSnippet(id: string): string {
  if (!GA.test(id)) throw new Error("Not a Google Analytics ID.");
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config", ${JSON.stringify(id)});`;
}

/** Meta's own snippet, with only the ID (checked, then quoted) put in. */
export function pixelSnippet(id: string): string {
  if (!PIXEL.test(id)) throw new Error("Not a Meta pixel ID.");
  return (
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};` +
    `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;` +
    `s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");` +
    `fbq("init", ${JSON.stringify(id)});fbq("track", "PageView");`
  );
}
