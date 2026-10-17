"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveCookieNoticeAction, type SettingsFormState } from "@/modules/sites/actions";
import type { CookieNotice } from "@/modules/sites/tracking";
import { Card, Field, Label, Notice, SaveBar, Select, Switch, Textarea } from "../../../ui";
import { keepValues } from "../../../../keep-values";

/**
 * Settings · Cookie notice. With it on, analytics wait for Accept (Carl,
 * Oct 2026); the visitor's answer is kept a year, so they're asked once.
 */
export function CookiesForm({ initial, pages, hasAnalytics, canEdit }: { initial: CookieNotice; pages: { path: string; title: string }[]; hasAnalytics: boolean; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await saveCookieNoticeAction(prev, form);
    if (r.ok) setSaved(v);
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const missing = v.policyPath && !pages.some((p) => p.path === v.policyPath);

  return (
    <form onSubmit={keepValues(act)} className="space-y-6">
      {!canEdit && <Notice error="Only an owner can change this. You can still read it." />}
      <Card className="p-4">
        <input type="hidden" name="enabled" value={v.enabled ? "on" : ""} />
        <Switch
          checked={v.enabled}
          disabled={!canEdit}
          onChange={(enabled) => setV({ ...v, enabled })}
          label="Show a cookie notice"
          hint={hasAnalytics ? "Google Analytics and the Meta pixel then wait until a visitor taps Accept. Decline means they never load." : "Visitors are asked once; their answer is kept for a year. Analytics, when you add them, wait for Accept."}
        />
      </Card>

      <section className="space-y-5">
        <Label>What it says</Label>
        <Field label="Message" htmlFor="c-message" hint="One or two plain sentences.">
          <Textarea id="c-message" name="message" rows={3} maxLength={400} value={v.message} readOnly={!canEdit} onChange={(e) => setV({ ...v, message: e.target.value })} />
        </Field>
        <Field label="Read more links to" htmlFor="c-policy" hint="Your privacy page, if you have one.">
          <Select id="c-policy" name="policyPath" value={v.policyPath} disabled={!canEdit} onChange={(e) => setV({ ...v, policyPath: e.target.value })}>
            <option value="">No link</option>
            {missing && <option value={v.policyPath}>{v.policyPath} (not published)</option>}
            {pages.map((p) => (
              <option key={p.path} value={p.path}>
                {p.title} · {p.path}
              </option>
            ))}
          </Select>
        </Field>
        {!canEdit && <input type="hidden" name="policyPath" value={v.policyPath} />}
      </section>

      <section>
        <Label>How it looks</Label>
        <div data-testid="cookie-preview" className="rounded-card border border-line bg-surface p-4 text-[14px] leading-[1.5] text-body">
          <p>
            {v.message}
            {v.policyPath && <span className="text-text underline underline-offset-4"> Read more</span>}
          </p>
          <div className="mt-3 flex gap-2">
            <span className="inline-flex h-9 items-center rounded-button bg-accent px-4 text-[14px] font-medium text-text">Accept</span>
            <span className="inline-flex h-9 items-center rounded-button border border-line px-4 text-[14px] text-text">Decline</span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">
          On your site it takes your own colours. Code added under{" "}
          <Link href="/settings/custom-code" className="text-accent-text underline underline-offset-4">
            Custom code
          </Link>{" "}
          isn&apos;t held back by this notice.
        </p>
      </section>

      {canEdit && <SaveBar dirty={dirty} pending={pending} state={state} />}
    </form>
  );
}
