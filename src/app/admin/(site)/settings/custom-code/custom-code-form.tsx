"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { revertCustomCodeAction, saveCustomCodeAction, type SettingsFormState } from "@/modules/sites/actions";
import { MAX_CODE, type CustomCode } from "@/modules/sites/custom-code-rules";
import { Button, Card, Field, Label, Notice, SaveBar, Textarea } from "../../../ui";
import { LocalTime } from "../../local-time";
import { keepValues } from "../../../../keep-values";

/**
 * Settings · Custom code: what goes at the start and the end of every page,
 * saved together, with the earlier versions underneath to put back.
 */
export function CustomCodeForm({ code, canEdit }: { code: CustomCode; canEdit: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState({ head: code.head, body: code.body });
  const [v, setV] = useState(saved);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await saveCustomCodeAction(prev, form);
    if (r.ok) {
      setSaved(v);
      router.refresh();
    }
    return r;
  }, {} as SettingsFormState);
  const [back, setBack] = useState<SettingsFormState>({});
  const [busy, start] = useTransition();
  const dirty = v.head !== saved.head || v.body !== saved.body;

  return (
    <form onSubmit={keepValues(act)} className="space-y-6">
      {!canEdit && <Notice error="Only an owner can change this. You can still read it." />}
      <Card variant="static" data-testid="code-warning" className="px-4 py-3.5 text-[13.5px] leading-[1.5] text-body">
        Code here runs on every page of your site, for every visitor. Only paste code from someone you trust, and check the site after saving. It isn&apos;t held back by the cookie notice, so Google Analytics and the Meta pixel belong under Analytics instead.
      </Card>

      <Field label="At the start of every page" htmlFor="code-head" hint="Scripts and styles a service asks you to add (chat widgets, booking tools, fonts).">
        <Textarea id="code-head" name="head" rows={8} maxLength={MAX_CODE} value={v.head} readOnly={!canEdit} spellCheck={false} className="font-mono text-[13px]" onChange={(e) => setV({ ...v, head: e.target.value })} />
      </Field>
      <Field label="At the end of every page" htmlFor="code-body" hint="For code that should load after everything else.">
        <Textarea id="code-body" name="body" rows={6} maxLength={MAX_CODE} value={v.body} readOnly={!canEdit} spellCheck={false} className="font-mono text-[13px]" onChange={(e) => setV({ ...v, body: e.target.value })} />
      </Field>
      {code.at && (
        <p className="text-[12.5px] text-muted">
          Last saved by {code.by || "someone"}, <LocalTime iso={code.at} style="day" />.
        </p>
      )}

      {code.history.length > 0 && (
        <section>
          <Label>Earlier versions</Label>
          <Card className="divide-y divide-line-soft">
            {code.history.map((h) => (
              <div key={h.at} data-testid="code-version" className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-text">
                    {h.by || "Someone"}, <LocalTime iso={h.at} style="day" />
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[12px] text-muted">{(h.head || h.body).replace(/\s+/g, " ").slice(0, 120) || "Empty"}</p>
                </div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await revertCustomCodeAction(h.at);
                        setBack(r);
                        if (r.ok) router.refresh();
                      })
                    }
                  >
                    Put this back
                  </Button>
                )}
              </div>
            ))}
          </Card>
          <div className="mt-2 min-h-5">
            <Notice {...back} />
          </div>
        </section>
      )}

      {canEdit && <SaveBar dirty={dirty} pending={pending} state={state} />}
    </form>
  );
}
