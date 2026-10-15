import type { Section } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { publicForm } from "@/modules/forms/server";
import { StorefrontForm } from "@/app/site/storefront-form";
import { parseSectionData, type ImageRef } from "./registry";

/**
 * How each section type looks on the storefront, as in the preview panel
 * of design/admin.html: a small accent label, a big heading, calm body
 * text, images with rounded corners. Headings come from position: the
 * page title is the h1, so every section heading is an h2. Tokens only;
 * the site's theme sets the colours.
 */
export function RenderSections({ sections }: { sections: Section[] }) {
  return (
    <div className="divide-y divide-[var(--border-soft)]">
      {sections.map((s) => (
        <RenderSection key={s.id} section={s} />
      ))}
    </div>
  );
}

function RenderSection({ section }: { section: Section }) {
  switch (section.type) {
    case "hero": {
      const d = parseSectionData("hero", section.data);
      return (
        <section className="py-10 md:py-16">
          <Label text={d.label} />
          {d.heading && <h2 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.8px] md:text-[52px]">{d.heading}</h2>}
          {d.text && <p className="mt-4 max-w-2xl text-[18px] leading-relaxed text-[var(--text-body)] md:text-[20px]">{d.text}</p>}
          {d.image && <Figure image={d.image} className="mt-8 aspect-[16/9] w-full rounded-[8px] object-cover" />}
        </section>
      );
    }
    case "text": {
      const d = parseSectionData("text", section.data);
      return (
        <section className="py-10 md:py-14">
          <Label text={d.label} />
          {d.heading && <h2 className="mb-5 text-[28px] font-semibold leading-[1.15] tracking-[-0.5px] md:text-[32px]">{d.heading}</h2>}
          <Paragraphs text={d.body} />
        </section>
      );
    }
    case "statement": {
      const d = parseSectionData("statement", section.data);
      return (
        <section className="py-12 md:py-20">
          <p className="max-w-3xl text-[26px] font-medium leading-[1.25] tracking-[-0.4px] md:text-[36px]">{d.text}</p>
        </section>
      );
    }
    case "pictureAndWords": {
      const d = parseSectionData("pictureAndWords", section.data);
      const pic = d.image ? <Figure image={d.image} className="aspect-[4/3] w-full rounded-[8px] object-cover" /> : null;
      return (
        <section className="grid items-center gap-8 py-10 md:grid-cols-2 md:gap-12 md:py-14">
          {d.pictureSide === "left" && pic}
          <div>
            {d.heading && <h2 className="mb-4 text-[26px] font-semibold leading-[1.15] tracking-[-0.4px] md:text-[30px]">{d.heading}</h2>}
            <Paragraphs text={d.body} />
          </div>
          {d.pictureSide === "right" && pic}
        </section>
      );
    }
    case "questions": {
      const d = parseSectionData("questions", section.data);
      return (
        <section className="py-10 md:py-14">
          {d.heading && <h2 className="mb-6 text-[26px] font-semibold leading-[1.15] tracking-[-0.4px] md:text-[30px]">{d.heading}</h2>}
          <dl className="divide-y divide-[var(--border-soft)] border-y border-[var(--border-soft)]">
            {d.items.map((it, i) => (
              <div key={i} className="py-5">
                <dt className="text-[17px] font-medium">{it.question}</dt>
                <dd className="mt-2 text-[var(--text-body)]">
                  <Paragraphs text={it.answer} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }
    case "form": {
      const d = parseSectionData("form", section.data);
      return (
        <section className="py-10 md:py-14">
          {d.heading && <h2 className="mb-3 text-[28px] font-semibold leading-[1.15] tracking-[-0.5px] md:text-[32px]">{d.heading}</h2>}
          {d.text && <p className="mb-6 max-w-2xl text-[17px] leading-[1.65] text-[var(--text-body)]">{d.text}</p>}
          <FormBlock siteId={section.siteId} formId={d.formId} />
        </section>
      );
    }
    default:
      return null;
  }
}

/** The form itself, loaded for this site. A missing or deleted form renders nothing rather than an error. */
async function FormBlock({ siteId, formId }: { siteId: string; formId: string }) {
  const form = formId ? await publicForm({ siteId, formId }) : null;
  if (!form) return null;
  return <StorefrontForm form={{ id: form.id, fields: form.fields, buttonText: form.buttonText, afterMessage: form.afterMessage }} />;
}

/** The small accent line above a heading. Nothing when empty. */
function Label({ text }: { text: string }) {
  if (!text) return null;
  return <p className="mb-3 font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">{text}</p>;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="mb-4 text-[17px] leading-[1.65] text-[var(--text-body)] last:mb-0">
            {p}
          </p>
        ))}
    </>
  );
}

/**
 * An image from the library. Width and height reserve the space so the
 * page doesn't jump; the browser loads it lazily. The address is worked
 * out here from settings, never stored in the page.
 */
function Figure({ image, className }: { image: ImageRef; className: string }) {
  const src = mediaUrl(image.key);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket; no optimiser in the loop
  return <img src={src} alt={image.alt} width={image.width} height={image.height} loading="lazy" className={className} />;
}
