"use client";

import { useActionState, useState } from "react";
import { updateThemeAction, type SettingsFormState } from "@/modules/sites/actions";
import type { Theme } from "@/modules/sites/theme";
import { Input, Label, SaveBar } from "../../../ui";

/** Light or dark, and the accent colour, with a swatch so the choice is visible before Save. */
export function ThemeForm({ theme, canEdit }: { theme: Theme; canEdit: boolean }) {
  const [saved, setSaved] = useState(theme);
  const [value, setValue] = useState(theme);
  const [state, act, pending] = useActionState(async (prev: SettingsFormState, form: FormData) => {
    const r = await updateThemeAction(prev, form);
    if (r.ok) setSaved({ mode: form.get("mode") as Theme["mode"], accent: String(form.get("accent")).toLowerCase() });
    return r;
  }, {} as SettingsFormState);
  const dirty = value.mode !== saved.mode || value.accent.toLowerCase() !== saved.accent;
  const validAccent = /^#[0-9a-fA-F]{6}$/.test(value.accent);

  return (
    <form action={act} className="space-y-7">
      <input type="hidden" name="mode" value={value.mode} />
      <section>
        <Label>Page</Label>
        <div role="radiogroup" aria-label="Page" className="flex rounded-[6px] border border-line bg-bg p-[3px]">
          {(["dark", "light"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value.mode === m}
              disabled={!canEdit}
              onClick={() => setValue({ ...value, mode: m })}
              className={`h-10 flex-1 rounded-button text-[14px] capitalize ${value.mode === m ? "bg-accent text-text" : "text-muted hover:text-text"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </section>
      <section>
        <Label>Brand colour</Label>
        <label htmlFor="accent" className="mb-1.5 block text-[13.5px] text-body">
          Colour
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Pick a colour"
            value={validAccent ? value.accent : "#2060ee"}
            disabled={!canEdit}
            onChange={(e) => setValue({ ...value, accent: e.target.value })}
            className="h-11 w-14 flex-none cursor-pointer rounded-button border border-control bg-transparent p-1"
          />
          <Input id="accent" name="accent" value={value.accent} maxLength={7} readOnly={!canEdit} className="font-mono" onChange={(e) => setValue({ ...value, accent: e.target.value })} />
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">Buttons, links and the small label above headings. A hex code like #2060EE.</p>
      </section>
      {canEdit ? <SaveBar dirty={dirty && validAccent} pending={pending} state={state} /> : <p className="text-[13px] text-muted">Only an owner can change this.</p>}
    </form>
  );
}
