import { z } from "zod";
import { imageRef } from "@/modules/pages/registry";

/**
 * How a site's storefront looks. Everything a client can change is here,
 * validated on every write and read with defaults, so a site with an
 * empty theme still renders. Colours are the only free values: a client's
 * brand colour is content, not code.
 *
 * Settings · Branding sets the logo, the favicon and three colours (text,
 * accent, background); every other shade (surfaces, lines, quieter text)
 * is worked out from those, so the page always hangs together. A site
 * that has only ever picked light or dark keeps that palette.
 * Settings · Footer sets what sits at the foot of every page.
 */
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #2060EE.")
  .transform((s) => s.toLowerCase());

export const footerSchema = z.object({
  /** A form shown at the foot of every page (a newsletter signup). Null: none. */
  newsletterFormId: z.string().uuid().nullable().default(null),
  /** The line above it: "Join the list". Empty: no heading. */
  newsletterHeading: z.string().trim().max(80).default(""),
});
export type Footer = z.infer<typeof footerSchema>;

export const themeSchema = z.object({
  /** Light or dark page. Worked out from the background once one is picked. */
  mode: z.enum(["dark", "light"]).default("dark"),
  /** The brand colour: buttons, the small label above headings, links. */
  accent: hex.default("#2060ee"),
  /** Words and the page behind them. Null: the light or dark palette. */
  text: hex.nullable().default(null),
  background: hex.nullable().default(null),
  /** In the header instead of the site's name. */
  logo: imageRef.nullable().default(null),
  /** The little icon in the browser tab. */
  favicon: imageRef.nullable().default(null),
  footer: footerSchema.default({ newsletterFormId: null, newsletterHeading: "" }),
});

export type Theme = z.infer<typeof themeSchema>;

/** Strict: what a write must pass. Throws a ZodError with a message for the form. */
export function parseTheme(raw: unknown): Theme {
  const t = themeSchema.parse(raw ?? {});
  // Picked colours decide light or dark, so anything keyed off the mode follows the page.
  return t.background ? { ...t, mode: luminance(t.background) < 0.4 ? "dark" : "light" } : t;
}

/** Lenient: what a read gets. A row with junk in it still renders, with defaults. */
export function readTheme(raw: unknown): Theme {
  const r = themeSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  // Keep what's good: a bad logo shouldn't cost the colours.
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keep = Object.fromEntries(Object.entries(o).filter(([k, v]) => (themeSchema.shape as Record<string, z.ZodTypeAny>)[k]?.safeParse(v).success));
  return themeSchema.parse(keep);
}

export const PALETTES = {
  dark: { text: "#ffffff", background: "#111111" },
  light: { text: "#1b1a17", background: "#faf9f5" },
} as const;

/** The text and background a theme really shows: picked ones, or its mode's palette. */
export function siteColours(t: Pick<Theme, "mode" | "text" | "background">): { text: string; background: string } {
  return { text: t.text ?? PALETTES[t.mode].text, background: t.background ?? PALETTES[t.mode].background };
}

/**
 * The CSS custom properties for a theme, set on the storefront root. The
 * two palettes mirror design/admin.html's dark and light tokens; picked
 * colours get the in-between shades mixed from text and background.
 */
export function themeVars(t: Theme): Record<string, string> {
  const dark = {
    "--bg": "#111111",
    "--surface": "#1a1a1a",
    "--border": "#303030",
    "--border-soft": "#262626",
    "--text": "#ffffff",
    "--text-body": "#cccccc",
    "--text-muted": "#888888",
    "--fg": "#ffffff",
    "--muted": "#888888",
  };
  const light = {
    "--bg": "#faf9f5",
    "--surface": "#ffffff",
    "--border": "#dad6ca",
    "--border-soft": "#e8e4db",
    "--text": "#1b1a17",
    "--text-body": "#3c3a35",
    "--text-muted": "#625e55",
    "--fg": "#1b1a17",
    "--muted": "#625e55",
  };
  const base = t.text && t.background ? mixed(t.text, t.background, t.mode) : t.mode === "light" ? light : dark;
  return {
    ...base,
    "--accent": t.accent,
    "--accent-text": t.mode === "light" ? t.accent : lighten(t.accent),
    // Words on an accent button: white, unless the accent is pale enough that dark reads better.
    "--accent-fg": contrast(t.accent, "#ffffff") >= contrast(t.accent, "#111111") ? "#ffffff" : "#111111",
  };
}

function mixed(text: string, bg: string, mode: "dark" | "light"): Record<string, string> {
  const muted = mix(text, bg, 0.45);
  return {
    "--bg": bg,
    "--surface": mode === "light" ? mix(bg, "#ffffff", 0.6) : mix(bg, text, 0.05),
    "--border": mix(bg, text, 0.18),
    "--border-soft": mix(bg, text, 0.1),
    "--text": text,
    "--text-body": mix(text, bg, 0.2),
    "--text-muted": muted,
    "--fg": text,
    "--muted": muted,
  };
}

/** a moved `amount` of the way toward b. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `#${((m(ar, br) << 16) | (m(ag, bg) << 8) | m(ab, bb)).toString(16).padStart(6, "0")}`;
}

/** A readable version of the accent on a dark page: mixed 35% toward white. */
function lighten(hex: string): string {
  return mix(hex, "#ffffff", 0.35);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. Body text wants 4.5; buttons and large type 3. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
