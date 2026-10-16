"use client";

import { useActionState, useState } from "react";
import { updateStatusNamesAction, type SettingsFormState } from "@/modules/sites/actions";
import { DEFAULT_STATUS_NAMES, type StatusKey } from "@/modules/sites/shop";
import { Field, Input, SaveBar } from "../../../ui";

const ORDER: StatusKey[] = ["new", "inProgress", "sent", "done"];

/** Four stages, in this order, renamed. Empty puts the default back. */
export function StatusesForm({ initial, canEdit }: { initial: Record<StatusKey, string>; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await updateStatusNamesAction(prev, form);
    if (r.ok) setSaved(v);
    return r;
  }, {} as SettingsFormState);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);

  return (
    <form action={act} className="space-y-4">
      <p className="text-[14px] leading-[1.55] text-body">Four stages, in this order. Rename them to the words you use — they show on orders and in the app.</p>
      {ORDER.map((k) => (
        <Field key={k} label={`Default: ${DEFAULT_STATUS_NAMES[k]}`} htmlFor={`st-${k}`}>
          <Input id={`st-${k}`} name={k} value={v[k]} maxLength={30} placeholder={DEFAULT_STATUS_NAMES[k]} readOnly={!canEdit} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
        </Field>
      ))}
      {canEdit ? <SaveBar dirty={dirty} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
