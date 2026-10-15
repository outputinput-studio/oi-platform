"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveSectionAction } from "@/modules/pages/actions";
import { emptySection, type ImageRef, type SectionData, type SectionType } from "@/modules/pages/registry";
import { Field, Input } from "../../../ui";
import { PicturePicker } from "./picture-picker";

/**
 * Edit one section's fields. Autosaves a moment after typing stops and
 * says so: Saving… → Saved, or Retry if the save failed (tap to try again).
 * Nothing is lost on a dropped connection: the text stays on screen and
 * the next change saves it all over again.
 */
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function SectionEditor({
  sectionId,
  type,
  initial,
  imageUrl,
  mediaAvailable,
}: {
  sectionId: string;
  type: SectionType;
  initial: unknown;
  /** Address of the section's current picture, if it has one (worked out on the server). */
  imageUrl?: string;
  mediaAvailable: boolean;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...emptySection(type), ...(initial as object) }));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
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
    [sectionId],
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
      <p className="text-right text-xs text-[var(--muted)]" aria-live="polite" data-testid="save-status">
        {status.kind === "saving" && "Saving…"}
        {status.kind === "saved" && "Saved"}
        {status.kind === "error" && (
          <button type="button" onClick={() => void save(data)} className="underline underline-offset-4">
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
  const picture = (
    <PicturePicker id={id} value={image} url={imageUrl} available={mediaAvailable} onChange={(next) => onChange({ image: next })} />
  );

  switch (type) {
    case "hero":
      return (
        <>
          <Field label="Headline" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Line underneath" htmlFor={`${id}-text`}>
            <Textarea id={`${id}-text`} value={str("text")} rows={2} maxLength={500} onChange={(v) => onChange({ text: v })} />
          </Field>
          {picture}
        </>
      );
    case "text":
      return (
        <>
          <Field label="Heading" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`${id}-body`}>
            <Textarea id={`${id}-body`} value={str("body")} rows={6} onChange={(v) => onChange({ body: v })} />
          </Field>
          <p className="text-sm text-[var(--muted)]">Leave an empty line between paragraphs.</p>
        </>
      );
    case "statement":
      return (
        <Field label="The line" htmlFor={`${id}-text`}>
          <Textarea id={`${id}-text`} value={str("text")} rows={2} maxLength={300} onChange={(v) => onChange({ text: v })} />
        </Field>
      );
    case "pictureAndWords":
      return (
        <>
          <Field label="Heading" htmlFor={`${id}-heading`}>
            <Input id={`${id}-heading`} value={str("heading")} maxLength={120} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Text" htmlFor={`${id}-body`}>
            <Textarea id={`${id}-body`} value={str("body")} rows={5} onChange={(v) => onChange({ body: v })} />
          </Field>
          <fieldset>
            <legend className="mb-1 block text-sm text-[var(--muted)]">Picture on the</legend>
            <div className="flex gap-2">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={d.pictureSide === side}
                  onClick={() => onChange({ pictureSide: side })}
                  className={`rounded-md border px-4 py-2 text-sm ${
                    d.pictureSide === side ? "border-[var(--accent)] text-[var(--fg)]" : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
          </fieldset>
          {picture}
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
            <div key={i} className="rounded-md border border-[var(--border)] p-3">
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
                    onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, answer: v } : x)))}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="mt-2 text-sm text-[var(--muted)] underline-offset-4 hover:underline"
              >
                Remove this question
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems([...items, { question: "", answer: "" }])}
            className="text-sm text-[var(--muted)] underline-offset-4 hover:underline"
          >
            + Add a question
          </button>
        </>
      );
    }
  }
}

function Textarea({
  id,
  value,
  rows,
  maxLength,
  onChange,
}: {
  id: string;
  value: string;
  rows: number;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-3 text-base outline-none focus:border-[var(--accent)]"
    />
  );
}
