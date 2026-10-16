/**
 * SVG logos and icons. An SVG is a little program as much as a picture:
 * it can carry scripts, event handlers, links to other sites and embedded
 * web pages. Our pages only ever show images through <img>, where none of
 * that runs, and the bucket serves SVGs as downloads so opening one
 * directly doesn't run anything either. This is the third lock: an SVG
 * that carries any of it is refused at upload, with a plain reason.
 *
 * What a logo exported from Figma, Illustrator or Inkscape contains —
 * shapes, paths, gradients, styles, embedded PNG/JPEG data, links within
 * the file (#id) — passes.
 */
export const MAX_SVG_BYTES = 1024 * 1024;
const MAX_SIDE = 4000;

export class SvgRefused extends Error {}

/** Checks an SVG's text; returns the size to show it at, or throws SvgRefused with a reason a person can act on. */
export function checkSvg(text: string): { width: number; height: number } {
  if (new TextEncoder().encode(text).byteLength > MAX_SVG_BYTES) throw new SvgRefused("That SVG is too big. Keep it under 1 MB.");
  if (!/<svg[\s>/]/i.test(text)) throw new SvgRefused("That doesn't look like an SVG file.");

  // Look at the text as a browser would read it, so &#106;avascript: doesn't slip past.
  const decoded = decodeEntities(text);
  for (const source of [text, decoded]) {
    const reason = refusal(source);
    if (reason) throw new SvgRefused(`That SVG can't be used: it ${reason}. Export it again as a plain SVG (no scripts or links), or use a PNG.`);
  }
  return size(text);
}

function refusal(s: string): string | null {
  const lower = s.toLowerCase();
  if (/<script[\s>/]/.test(lower)) return "has a script in it";
  if (/<(foreignobject|iframe|embed|object|audio|video|canvas)[\s>/]/.test(lower)) return "has an embedded page or player in it";
  if (/<!entity/.test(lower) || /<!doctype[^>]*\[/.test(lower)) return "defines its own entities";
  if (/\son[a-z]+\s*=/.test(lower)) return "has code that runs on events";
  if (/(java|vb)script\s*:/.test(lower) || /data:\s*text\/html/.test(lower)) return "has a script link in it";
  if (/@import/.test(lower) || /url\(\s*['"]?\s*(https?:|\/\/)/.test(lower)) return "loads things from another site";
  for (const m of s.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    const v = m[1].trim().toLowerCase();
    if (!(v.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);/.test(v))) return "links to something outside the file";
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => safeChar(parseInt(d, 10)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "");
}

function safeChar(n: number): string {
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
}

/** The SVG's own width and height, or its viewBox's, fitted inside MAX_SIDE. */
function size(text: string): { width: number; height: number } {
  const tag = text.match(/<svg[^>]*>/i)?.[0] ?? "";
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*(px)?\\s*["']`, "i"))?.[1];
  const box = tag.match(/viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i);
  let w = Number(attr("width") ?? box?.[1] ?? 0);
  let h = Number(attr("height") ?? box?.[2] ?? 0);
  if (!(w > 0 && h > 0)) {
    // No size at all: a sensible logo-ish default, keeping the viewBox's shape if there is one.
    const ratio = box && Number(box[1]) > 0 && Number(box[2]) > 0 ? Number(box[1]) / Number(box[2]) : 1;
    w = 512;
    h = 512 / ratio;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
