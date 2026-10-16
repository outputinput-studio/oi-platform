import { z } from "zod";
import { imageRef } from "@/modules/pages/registry";

/**
 * Settings · Search engines: the site-wide side of being found. Page by
 * page lives in Search and sharing on each page; this is the pattern
 * titles follow, the picture a shared link gets when the page has none,
 * the Search Console proof, the business Google should know about, and
 * the switch that hides a site that isn't ready.
 */
const url = z.string().trim().max(300).refine((s) => s === "" || /^https?:\/\/\S+$/.test(s), "Paste the full address, starting with https://");

/** Social profiles: shown in the footer (Settings · Footer) and given to Google as the business's other homes. */
export const SOCIAL_NETWORKS = [
  ["instagram", "Instagram", "https://www.instagram.com/yourname"],
  ["facebook", "Facebook", "https://www.facebook.com/yourpage"],
  ["tiktok", "TikTok", "https://www.tiktok.com/@yourname"],
  ["youtube", "YouTube", "https://www.youtube.com/@yourchannel"],
  ["x", "X", "https://x.com/yourname"],
  ["linkedin", "LinkedIn", "https://www.linkedin.com/company/yours"],
  ["line", "LINE", "https://line.me/R/ti/p/@yourid"],
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number][0];

export const socialSchema = z.object({
  facebook: url.default(""),
  instagram: url.default(""),
  x: url.default(""),
  linkedin: url.default(""),
  youtube: url.default(""),
  tiktok: url.default(""),
  line: url.default(""),
});

const businessSchema = z.object({
  /** Older sites: name, phone and email now live in Settings · Business profile, the logo in Branding. */
  name: z.string().trim().max(120).default(""),
  description: z.string().trim().max(300).default(""),
  logo: imageRef.nullable().default(null),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(200).refine((s) => s === "" || z.string().email().safeParse(s).success, "That doesn't look like an email address.").default(""),
  ...socialSchema.shape,
});
export type Business = z.infer<typeof businessSchema>;

export const searchSettingsSchema = z.object({
  /** "[Page name] · [Site name]": the two tokens are swapped in at render time. */
  titlePattern: z.string().trim().max(120).default("[Page name] · [Site name]"),
  /** Used when a page has no sharing image of its own. */
  shareImage: imageRef.nullable().default(null),
  /** The google-site-verification meta content, if the client sets up Search Console themselves. */
  searchConsole: z
    .string()
    .trim()
    .max(200)
    .transform((s) => s.replace(/^google-site-verification=/, ""))
    .default(""),
  /** The whole site asks search engines to stay away. */
  hideFromSearch: z.boolean().default(false),
  /** When a live page or article is renamed, the old address keeps working. */
  autoRedirect: z.boolean().default(true),
  /** Extra lines for /robots.txt, for the rare owner who needs them. */
  robotsExtra: z.string().trim().max(2_000).default(""),
  /** What Google's knowledge panel is told: an Organization, as JSON-LD on the front page. */
  business: businessSchema.default(() => businessSchema.parse({})),
});
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

export function readSearchSettings(raw: unknown): SearchSettings {
  const r = searchSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : searchSettingsSchema.parse({});
}

/** A page's <title> from the pattern: "[Page name] · [Site name]" → "About · Kini". The front page is just the site. */
export function pageTitle(pattern: string, pageName: string, siteName: string): string {
  if (!pageName || pageName === siteName) return siteName;
  const t = pattern.replace(/\[Page name\]/gi, pageName).replace(/\[Site name\]/gi, siteName).trim();
  return t || `${pageName} · ${siteName}`;
}

/** The social links that are filled in, for schema.org sameAs. */
export function socialLinks(b: SearchSettings["business"]): string[] {
  return [b.facebook, b.instagram, b.x, b.linkedin, b.youtube, b.tiktok, b.line].filter(Boolean);
}
