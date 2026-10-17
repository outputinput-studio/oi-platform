"use client";

import { useActionState, useState } from "react";
import { askForHelpAction, type HelpFormState } from "@/modules/help/actions";
import { keepValues } from "../../keep-values";
import { Button, Field, Notice, Textarea } from "../../ui";

const TOPICS = [
  { value: "broken", title: "Something's broken", hint: "A page, a payment, an email that didn't send." },
  { value: "question", title: "A question", hint: "How do I do something, or something I'd like changed." },
] as const;

/** "Ask us": what it's about, in their own words, sent with the screen they were on. */
export function HelpForm({ from, sentWith }: { from?: string; sentWith: string }) {
  const [state, act, pending] = useActionState<HelpFormState, FormData>(askForHelpAction, {});
  const [topic, setTopic] = useState<string>("");
  if (state.ok) {
    return (
      <div className="rounded-card border border-line bg-surface p-5" data-testid="help-sent">
        <p className="text-[16px] font-semibold">We&rsquo;ve got it</p>
        <p className="mt-1.5 text-[14px] text-body">{state.ok}</p>
      </div>
    );
  }
  return (
    <form onSubmit={keepValues(act)} className="space-y-5">
      <input type="hidden" name="from" value={from ?? ""} />
      <fieldset data-field="topic">
        <legend className="label mb-2.5">What&rsquo;s this about?</legend>
        <div className="space-y-2">
          {TOPICS.map((t) => (
            <label
              key={t.value}
              className={`flex cursor-pointer items-start gap-3 rounded-card border bg-surface px-4 py-3.5 ${topic === t.value ? "border-accent" : "border-line hover:bg-hover"}`}
            >
              <input type="radio" name="topic" value={t.value} checked={topic === t.value} onChange={() => setTopic(t.value)} className="mt-1 accent-[var(--accent)]" />
              <span>
                <span className="block text-[15px] font-medium">{t.title}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Your message" htmlFor="help-message">
        <Textarea id="help-message" name="message" rows={6} maxLength={4000} />
      </Field>
      <p className="text-[12.5px] text-muted">
        <span className="label mr-1.5">Sent with your message</span>
        {sentWith}
      </p>
      <Notice error={state.error} fields={state.fields} />
      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Sending…" : "Send it"}
      </Button>
    </form>
  );
}
