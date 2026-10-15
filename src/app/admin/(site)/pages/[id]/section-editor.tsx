"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveSectionAction } from "@/modules/pages/actions";
import { emptySection, type ImageRef, type SectionData, type SectionType } from "@/modules/pages/registry";
import { Field, Input, Textarea } from "../../../ui";
import { ImagePicker } from "./image-picker";

/**
 * Edit one section's fields. Autosaves a moment after typing stops and
 * says so: Saving… → Saved, or Retry if the save failed (tap to try again).
 * Nothing is lost on a dropped connection: the text stays on screen and
 * the next change saves it all over again.
 */
export type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function SectionEditor({
  sectionId,
  type,
  initial,
  imageUrl,
  mediaAvailable,
  onStatus,
}: {
  sectionId: string;
  type: SectionType;
  initial: unknown;
  /** Address of the section's current image, if it has one (worked out on the server). */
  imageUrl?: string;
  mediaAvailable: boolean;
  /** Tells the page what this section is up to, so the header can show one Saved for everything. */
  onStatus?: (id: string, s: Status) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...emptySection(type), ...(initial as object) }));
  const [status, setStatusLocal] = useState<Status>({ kind: "idle" });
  const setStatus = useCallback(
    (s: Status) => {
      setStatusLocal(s);
      onStatus?.(sectionId, s);
    },
    [onStatus, sectionId],
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (snapshot: Record<string, unknown>) => {
      setStatus({ kind: "saving" });
      try {
        const r = await saveSectionAction(sectionId, snapshot);
        setStatus(r.error ? { kind: "error", message: r.error } : { kind: "saved" });
      } catch {
        // The request itself failed (offline, server away). Keep the text; offer a retry.
        setStatus({ kind: "error", message: "couldn't reach the server" });
      }
    },
    [sectionId, setStatus],
  );

  const change = (patch: Record<string, unknown>) => {
    const next = { ...data, ...patch };
    setData(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="space-y-3">
      <Fields type={type} data={data as SectionData} onChange={change} id={sectionId} imageUrl={imageUrl} mediaAvailable={mediaAvailable} />
      <p className="text-right text-[12px] text-muted" aria-live="polite" data-testid="save-status">
        {status.kind === "saving" && "Saving…"}
        {status.kind === "saved" && "Saved"}
        {status.kind === "error" && (
          <button type="button" onClick={() => void save(data)} className="text-alert underline underline-offset-4">
            Retry — {status.message}
          </button>
        )}
      </p>
    </div>
  );
}

function Fields({
  type,
  data,
  onChange,
  id,
  imageUrl,
  mediaAvailable,
}: {
  type: SectionType;
  data: SectionData;
  onChange: (patch: Record<string, unknown>) => void;
  id: string;
  imageUrl?: string;
  mediaAvailable: boolean;
}) {
  const d = data as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const image = d.image && typeof d.image === "object" ? (d.image as ImageRef) : undefined;
  const picker = (
    <ImagePicker id={id} value={image} url={imageUrl} available={mediaAvailable} onChange={(next) => onChange({ image: next })} />
  );

  switch (type) {
    case "hero":
      return (
        <>
          <Field label="Label" htmlFor={`${id}-label`} hint="Small text above the headline. Leave empty to hide it.">
            <Input id={`${id}-label`} value={str("label")} maxLength={60} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          <Field label="Headline" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Line underneath" htmlFor={`${id}-text`} hint="One or two sentences. Leave empty to hide it.">
            <Textarea id={`${id}-text`} value={str("text")} rows={2} maxLength={500} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          {picker}
        </>
      );
    case "text":
      return (
        <>
          <Field label="Label" htmlFor={`${id}-label`} hint="Small text above the heading. Leave empty to hide it.">
            <Input id={`${id}-label`} value={str("label")} maxLength={60} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
          <Field label="Heading" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`${id}-body`} hint="Leave an empty line between paragraphs.">
            <Textarea id={`${id}-body`} value={str("body")} rows={6} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
        </>
      );
    case "statement":
      return (
        <Field label="The line" htmlFor={`${id}-text`} hint="One sentence, big. Make it count.">
          <Textarea id={`${id}-text`} value={str("text")} rows={2} maxLength={300} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      );
    case "pictureAndWords":
      return (
        <>
          <Field label="Heading" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`${id}-body`} hint="Leave an empty line between paragraphs.">
            <Textarea id={`${id}-body`} value={str("body")} rows={5} onChange={(e) => onChange({ body: e.target.value })} />
          </Field>
          <fieldset>
            <legend className="mb-1.5 block text-[13.5px] text-body">Image on the</legend>
            <div className="flex rounded-[6px] border border-line bg-bg p-[3px]">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={d.pictureSide === side}
                  onClick={() => onChange({ pictureSide: side })}
                  className={`h-9 flex-1 rounded-button text-[13.5px] capitalize ${
                    d.pictureSide === side ? "bg-accent text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </fieldset>
          {picker}
        </>
      );
    case "questions": {
      const items = Array.isArray(d.items) ? (d.items as Array<{ question: string; answer: string }>) : [];
      const setItems = (next: typeof items) => onChange({ items: next });
      return (
        <>
          <Field label="Heading" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          {items.map((it, i) => (
            <div key={i} className="rounded-card border border-line-soft bg-bg p-3">
              <Field label={`Question ${i + 1}`} htmlFor={`${id}-q-${i}`}>
                <Input
                  id={`${id}-q-${i}`}
                  value={it.question}
                  maxLength={300}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                />
              </Field>
              <div className="mt-2">
                <Field label="Answer" htmlFor={`${id}-a-${i}`}>
                  <Textarea
                    id={`${id}-a-${i}`}
                    value={it.answer}
                    rows={3}
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="mt-2 text-[13px] text-muted underline-offset-4 hover:underline"
              >
                Remove this question
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems([...items, { question: "", answer: "" }])}
            className="text-[13.5px] text-accent-text underline-offset-4 hover:underline"
          >
            + Add a question
          </button>
        </>
      );
    }
  }
}
