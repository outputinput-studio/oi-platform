"use client";

import { useState, useTransition } from "react";
import { saveBrandingAction, type SettingsFormState } from "@/modules/sites/actions";
import type { ImageRef } from "@/modules/pages/registry";
import { contrast, PALETTES } from "@/modules/sites/theme";
import { Button, Input, Label, Notice } from "../../../ui";
import { ImagePicker } from "../../pages/[id]/image-picker";

type Brand = { accent: string; text: string; background: string; logo: ImageRef | null; favicon: ImageRef | null };
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Logo, favicon and three colours, with a small sample of the page so a
 * choice is visible before it's saved, and a warning when something will
 * be hard to read. The admin itself stays in output/input's colours.
 */
export function BrandingForm({ initial, urls, siteName, mediaAvailable, canEdit }: { initial: Brand; urls: { logo?: string; favicon?: string }; siteName: string; mediaAvailable: boolean; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [state, setState] = useState<SettingsFormState>({});
  const [pending, start] = useTransition();
  const valid = HEX.test(v.text) && HEX.test(v.accent) && HEX.test(v.background);
  const dirty = JSON.stringify(v) !== saved;
  const textOk = valid && contrast(v.text, v.background) >= 4.5;
  const accentOk = valid && contrast(v.accent, v.background) >= 3;
  const onAccent = valid && contrast(v.accent, "#ffffff") >= contrast(v.accent, "#111111") ? "#ffffff" : "#111111";

  const save = () =>
    start(async () => {
      const r: SettingsFormState = await saveBrandingAction(v).catch(() => ({ error: "Couldn't reach the server. Try again." }));
      setState(r);
      if (r.ok) setSaved(JSON.stringify(v));
    });

  const colour = (k: "text" | "accent" | "background", label: string, hint: string) => (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={`Pick the ${label.toLowerCase()} colour`}
        value={HEX.test(v[k]) ? v[k] : "#000000"}
        disabled={!canEdit}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        className="h-11 w-14 flex-none cursor-pointer rounded-button border border-control bg-transparent p-1"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={`brand-${k}`} className="block text-[14.5px]">
          {label}
        </label>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </div>
      <Input id={`brand-${k}`} data-field={k} aria-invalid={!HEX.test(v[k]) || undefined} value={v[k]} maxLength={7} readOnly={!canEdit} className="!w-[110px] flex-none font-mono" onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-7">
      <section>
        <Label>Logo</Label>
        <div data-field="logo">
          <ImagePicker id="brand-logo" value={v.logo ?? undefined} url={urls.logo} available={mediaAvailable && canEdit} onChange={(logo) => setV({ ...v, logo: logo ?? null })} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">PNG or SVG on a clear background works best. It shows in your site&apos;s header instead of &ldquo;{siteName}&rdquo;.</p>
      </section>
      <section>
        <Label>Favicon</Label>
        <div data-field="favicon">
          <ImagePicker id="brand-favicon" value={v.favicon ?? undefined} url={urls.favicon} available={mediaAvailable && canEdit} onChange={(favicon) => setV({ ...v, favicon: favicon ?? null })} />
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">The little icon in the browser tab. A square image works best.</p>
      </section>
      <section>
        <Label
          right={
            canEdit && (
              <span className="flex gap-3">
                <button type="button" className="hover:text-text" onClick={() => setV({ ...v, ...PALETTES.light })}>
                  Start from light
                </button>
                <button type="button" className="hover:text-text" onClick={() => setV({ ...v, ...PALETTES.dark })}>
                  Start from dark
                </button>
              </span>
            )
          }
        >
          Site colours
        </Label>
        <div className="space-y-3 rounded-card border border-line bg-surface p-4">
          {colour("text", "Text", "Headings and words")}
          {colour("accent", "Accent", "Buttons, links, the small label above headings")}
          {colour("background", "Background", "Behind everything")}
        </div>
        {valid && (
          <div data-testid="brand-sample" className="mt-3 rounded-card border border-line p-4" style={{ background: v.background, color: v.text }}>
            <p className="font-mono text-[11px] uppercase tracking-[1.5px]" style={{ color: v.accent }}>
              New in
            </p>
            <p className="mt-1 text-[20px] font-semibold">{siteName}</p>
            <span className="mt-3 inline-flex h-9 items-center rounded-[6px] px-4 text-[13.5px] font-medium" style={{ background: v.accent, color: onAccent }}>
              Add to cart
            </span>
          </div>
        )}
        {!valid && <p className="mt-2 text-[12.5px] text-alert">Each colour is a hex code like #2060EE.</p>}
        {valid && !textOk && <p className="mt-2 text-[12.5px] text-warning">The text may be hard to read on this background. Darker text on a light background (or the other way round) reads best.</p>}
        {valid && !accentOk && <p className="mt-2 text-[12.5px] text-warning">The accent may not stand out from the background, so links and buttons could be missed.</p>}
        <p className="mt-2 text-[12.5px] text-muted">These are your site&apos;s colours. This app stays in output/input colours.</p>
      </section>
      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" className="w-full" disabled={!dirty || !valid || pending} onClick={save}>
            {pending ? "Saving…" : dirty ? "Save branding" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change this.</p>
      )}
    </div>
  );
}
