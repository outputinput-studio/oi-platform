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
 * Images are a reference to the media library ({ url, alt }). Until the
 * media stage lands they stay optional, so no migration is needed later.
 */
export const imageRef = z.object({
  url: z.string().url(),
  /** Shown to people who can't see the picture. Asked for as "Describe this photo". */
  alt: z.string().max(300).default(""),
});
export type ImageRef = z.infer<typeof imageRef>;

const heading = z.string().trim().max(120).default("");
const body = z.string().max(20_000).default("");

export const sectionTypes = {
  text: {
    label: "Text",
    description: "A heading and some paragraphs.",
    schema: z.object({ heading, body }),
  },
  statement: {
    label: "Statement",
    description: "One big line that stands on its own.",
    schema: z.object({ text: z.string().trim().max(300).default("") }),
  },
  hero: {
    label: "Hero",
    description: "The opening: a headline, a line underneath, a picture.",
    schema: z.object({ heading, text: z.string().trim().max(500).default(""), image: imageRef.optional() }),
  },
  pictureAndWords: {
    label: "Picture and words",
    description: "A picture beside some text.",
    schema: z.object({
      heading,
      body,
      image: imageRef.optional(),
      pictureSide: z.enum(["left", "right"]).default("left"),
    }),
  },
  questions: {
    label: "Questions and answers",
    description: "A list of questions people ask, each with its answer.",
    schema: z.object({
      heading,
      items: z.array(z.object({ question: z.string().trim().max(300), answer: z.string().max(5_000) })).max(50).default([]),
    }),
  },
} as const;

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
