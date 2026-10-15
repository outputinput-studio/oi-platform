import { z } from "zod";

/**
 * The section registry: every kind of block a page can hold.
 *
 * A page is a stack of these. Clients choose a type, fill in its fields,
 * and reorder; they never touch layout. Adding a section type means adding
 * an entry here plus a renderer (render.tsx) and an editor (the admin).
 * Nothing is ever hand-built for one client.
 *
 * Headings come from position: the page title is the h1, a section's
 * heading is an h2. Clients never choose a heading level.
 *
 * Images are a reference into the media library by storage key, never by
 * address: the public address comes from settings at render time, so the
 * bucket can move (r2.dev today, media.outputinput.co tomorrow) without
 * touching a single page. Width and height are copied in so the storefront
 * can reserve the space before the image arrives.
 */
export const imageRef = z.object({
  key: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/, "Not an image from the library."),
  /** Shown to people who can't see the image. Asked for as "Describe this photo". */
  alt: z.string().trim().max(300).default(""),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageRef = z.infer<typeof imageRef>;

const heading = z.string().trim().max(120).default("");
const body = z.string().max(20_000).default("");
/** Small text above the heading ("MADE TO MEASURE"). Empty hides it. */
const label = z.string().trim().max(60).default("");

/** How the add-section sheet groups the types. */
export const SECTION_GROUPS = { words: "Words", images: "Images", forms: "Forms" } as const;
export type SectionGroup = keyof typeof SECTION_GROUPS;

export const sectionTypes = {
  text: {
    label: "Text",
    description: "A heading and words",
    group: "words" as SectionGroup,
    schema: z.object({ label, heading, body }),
  },
  statement: {
    label: "Statement",
    description: "One big line on its own",
    group: "words" as SectionGroup,
    schema: z.object({ text: z.string().trim().max(300).default("") }),
  },
  questions: {
    label: "Questions and answers",
    description: "Things people ask, with answers",
    group: "words" as SectionGroup,
    schema: z.object({
      heading,
      items: z.array(z.object({ question: z.string().trim().max(300), answer: z.string().max(5_000) })).max(50).default([]),
    }),
  },
  hero: {
    label: "Hero",
    description: "A headline, a line underneath, one big image",
    group: "images" as SectionGroup,
    schema: z.object({ label, heading, text: z.string().trim().max(500).default(""), image: imageRef.optional() }),
  },
  form: {
    label: "Form",
    description: "One of your forms, for people to fill in",
    group: "forms" as SectionGroup,
    /** The form is the site's own (checked on save); an empty id shows a reminder in the editor and nothing on the page. */
    schema: z.object({ formId: z.string().max(40).default(""), heading, text: z.string().trim().max(500).default("") }),
  },
  pictureAndWords: {
    label: "Image and words",
    description: "One image beside words",
    group: "images" as SectionGroup,
    schema: z.object({
      heading,
      body,
      image: imageRef.optional(),
      pictureSide: z.enum(["left", "right"]).default("left"),
    }),
  },
} as const;

/** The words a section shows when it's folded up: its heading, or its first line. */
export function sectionSummary(type: SectionType, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => keys.map((k) => (typeof d[k] === "string" ? (d[k] as string).trim() : "")).find(Boolean) ?? "";
  switch (type) {
    case "statement":
      return pick("text");
    case "questions": {
      const items = Array.isArray(d.items) ? d.items : [];
      return pick("heading") || (items.length ? `${items.length} question${items.length === 1 ? "" : "s"}` : "");
    }
    case "form":
      return pick("heading") || (d.formId ? "" : "No form picked yet");
    default:
      return pick("heading", "text", "body");
  }
}

export type SectionType = keyof typeof sectionTypes;
export const SECTION_TYPES = Object.keys(sectionTypes) as SectionType[];

export type SectionData<T extends SectionType = SectionType> = z.infer<(typeof sectionTypes)[T]["schema"]>;

export function isSectionType(t: string): t is SectionType {
  return t in sectionTypes;
}

/** Validate data for a type; throws a ZodError the caller turns into a message. */
export function parseSectionData<T extends SectionType>(type: T, data: unknown): SectionData<T> {
  return sectionTypes[type].schema.parse(data ?? {}) as SectionData<T>;
}

/** What a new section of this type starts as. */
export function emptySection<T extends SectionType>(type: T): SectionData<T> {
  return parseSectionData(type, {});
}
