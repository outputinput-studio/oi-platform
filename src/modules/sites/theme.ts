import { z } from "zod";

/**
 * How a site's storefront looks. Everything a client can change is here,
 * validated on every write and read with defaults, so a site with an
 * empty theme still renders. Colours are the only free values: a client's
 * brand colour is content, not code.
 */
export const themeSchema = z.object({
  /** Light or dark page. */
  mode: z.enum(["dark", "light"]).default("dark"),
  /** The brand colour: buttons, the small label above headings, links. */
  accent: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #2060EE.")
    .transform((s) => s.toLowerCase())
    .default("#2060ee"),
});

export type Theme = z.infer<typeof themeSchema>;

/** Strict: what a write must pass. Throws a ZodError with a message for the form. */
export function parseTheme(raw: unknown): Theme {
  return themeSchema.parse(raw ?? {});
}

/** Lenient: what a read gets. A row with junk in it still renders, with defaults. */
export function readTheme(raw: unknown): Theme {
  const r = themeSchema.safeParse(raw ?? {});
  return r.success ? r.data : themeSchema.parse({});
}

/**
 * The CSS custom properties for a theme, set on the storefront root. The
 * palettes mirror design/admin.html's dark and light tokens.
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
  return { ...(t.mode === "light" ? light : dark), "--accent": t.accent, "--accent-text": t.mode === "light" ? t.accent : lighten(t.accent) };
}

/** A readable version of the accent on a dark page: mixed 35% toward white. */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
