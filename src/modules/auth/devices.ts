/**
 * "iPhone · Safari", "Mac · Chrome": a signed-in session in words a person
 * recognises, from the browser's user agent. Rough on purpose: enough to
 * tell your phone from your laptop, nothing more.
 */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "A browser";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  // Order matters: Edge and Opera say Chrome too, and Chrome says Safari.
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /SamsungBrowser/.test(ua)
          ? "Samsung Internet"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  if (!device && !browser) return "A browser";
  return [device, browser].filter(Boolean).join(" · ");
}
