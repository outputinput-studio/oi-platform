import type { Section } from "@/db/schema";
import { parseSectionData, type SectionData } from "./registry";

/**
 * How each section type looks on the storefront. Headings come from
 * position: the page title is the h1, so every section heading is an h2.
 * Stage 4a: plain, token-driven rendering. Themes dress this later.
 */
export function RenderSections({ sections }: { sections: Section[] }) {
  return (
    <>
      {sections.map((s) => (
        <RenderSection key={s.id} section={s} />
      ))}
    </>
  );
}

function RenderSection({ section }: { section: Section }) {
  switch (section.type) {
    case "hero": {
      const d = parseSectionData("hero", section.data);
      return (
        <section className="py-16 md:py-24">
          {d.image && <Picture image={d.image} className="mb-8 aspect-[16/9] w-full rounded-lg object-cover" />}
          {d.heading && <h2 className="text-4xl font-semibold md:text-6xl">{d.heading}</h2>}
          {d.text && <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">{d.text}</p>}
        </section>
      );
    }
    case "text": {
      const d = parseSectionData("text", section.data);
      return (
        <section className="py-10">
          {d.heading && <h2 className="mb-4 text-2xl font-semibold">{d.heading}</h2>}
          <Paragraphs text={d.body} />
        </section>
      );
    }
    case "statement": {
      const d = parseSectionData("statement", section.data);
      return (
        <section className="py-16">
          <p className="text-2xl font-medium leading-snug md:text-3xl">{d.text}</p>
        </section>
      );
    }
    case "pictureAndWords": {
      const d = parseSectionData("pictureAndWords", section.data);
      const pic = d.image ? <Picture image={d.image} className="aspect-[4/3] w-full rounded-lg object-cover" /> : null;
      return (
        <section className="grid items-center gap-8 py-10 md:grid-cols-2">
          {d.pictureSide === "left" && pic}
          <div>
            {d.heading && <h2 className="mb-4 text-2xl font-semibold">{d.heading}</h2>}
            <Paragraphs text={d.body} />
          </div>
          {d.pictureSide === "right" && pic}
        </section>
      );
    }
    case "questions": {
      const d = parseSectionData("questions", section.data);
      return (
        <section className="py-10">
          {d.heading && <h2 className="mb-6 text-2xl font-semibold">{d.heading}</h2>}
          <dl className="divide-y divide-[var(--border)]">
            {d.items.map((it, i) => (
              <div key={i} className="py-4">
                <dt className="text-lg font-medium">{it.question}</dt>
                <dd className="mt-1 text-[var(--muted)]">
                  <Paragraphs text={it.answer} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }
    default:
      return null;
  }
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="mb-4 leading-relaxed last:mb-0">
            {p}
          </p>
        ))}
    </>
  );
}

function Picture({ image, className }: { image: NonNullable<SectionData<"hero">["image"]>; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- media sizing arrives with the media stage
  return <img src={image.url} alt={image.alt} className={className} />;
}
