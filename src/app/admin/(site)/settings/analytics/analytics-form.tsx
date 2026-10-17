"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveAnalyticsAction, type SettingsFormState } from "@/modules/sites/actions";
import { analyticsSchema, type Analytics } from "@/modules/sites/tracking";
import { Card, Field, Input, Label, Notice, SaveBar } from "../../../ui";
import { keepValues } from "../../../../keep-values";

/**
 * Settings · Analytics: the IDs, never code. Someone who pastes Google's or
 * Meta's whole snippet gets the ID picked out of it on save.
 */
export function AnalyticsForm({ initial, noticeOn, live, canEdit }: { initial: Analytics; noticeOn: boolean; live: boolean; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await saveAnalyticsAction(prev, form);
    if (r.ok) {
      const clean = analyticsSchema.parse(v);
      setV(clean);
      setSaved(clean);
    }
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  return (
    <form onSubmit={keepValues(act)} className="space-y-6">
      {!canEdit && <Notice error="Only an owner can change these. You can still read them." />}
      <section className="space-y-5">
        <Label>Where visits are counted</Label>
        <Field label="Google Analytics" htmlFor="a-ga" hint="Your GA4 measurement ID, like G-XXXXXXXXXX. In Google Analytics: Admin → Data streams → your site.">
          <Input id="a-ga" name="gaId" value={v.gaId} maxLength={2000} placeholder="G-XXXXXXXXXX" autoComplete="off" spellCheck={false} readOnly={!canEdit} className="font-mono" onChange={(e) => setV({ ...v, gaId: e.target.value })} />
        </Field>
        <Field label="Meta pixel" htmlFor="a-pixel" hint="The pixel ID from Meta Events Manager: a long number. It lets Facebook and Instagram ads see who visits.">
          <Input id="a-pixel" name="metaPixelId" value={v.metaPixelId} maxLength={4000} placeholder="1234567890123456" inputMode="numeric" autoComplete="off" spellCheck={false} readOnly={!canEdit} className="font-mono" onChange={(e) => setV({ ...v, metaPixelId: e.target.value })} />
        </Field>
        <p className="text-[12.5px] leading-[1.5] text-muted">Pasted the whole snippet Google or Meta gave you? That&apos;s fine: the ID is picked out of it when you save. Nothing else from it is used.</p>
      </section>

      <section>
        <Label>When they load</Label>
        <Card variant="static" data-testid="analytics-consent" className="px-4 py-3.5 text-[13.5px] leading-[1.5] text-body">
          {noticeOn ? (
            <>Your cookie notice is on, so these only load for visitors who tap Accept.</>
          ) : (
            <>
              There&apos;s no cookie notice, so these load for every visitor. In places like the EU, the UK and Thailand you&apos;re expected to ask first.{" "}
              <Link href="/settings/cookies" className="text-accent-text underline underline-offset-4">
                Cookie notice
              </Link>
            </>
          )}
          {!live && <span className="mt-2 block text-muted">Your site isn&apos;t live yet, so nothing is counted until you launch it.</span>}
        </Card>
      </section>

      {canEdit && <SaveBar dirty={dirty} pending={pending} state={state} />}
    </form>
  );
}
