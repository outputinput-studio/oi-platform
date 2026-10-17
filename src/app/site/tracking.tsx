import Script from "next/script";
import { gaSnippet, gaSrc, pixelSnippet, type Analytics } from "@/modules/sites/tracking";

/**
 * Google Analytics and the Meta pixel, written from their IDs (Settings ·
 * Analytics). Only rendered for a live site, and, with the cookie notice
 * on, only once the visitor has said yes.
 */
export function AnalyticsScripts({ a }: { a: Analytics }) {
  return (
    <>
      {a.gaId && (
        <>
          <Script src={gaSrc(a.gaId)} strategy="afterInteractive" />
          <Script id="oi-ga" strategy="afterInteractive">
            {gaSnippet(a.gaId)}
          </Script>
        </>
      )}
      {a.metaPixelId && (
        <Script id="oi-pixel" strategy="afterInteractive">
          {pixelSnippet(a.metaPixelId)}
        </Script>
      )}
    </>
  );
}
