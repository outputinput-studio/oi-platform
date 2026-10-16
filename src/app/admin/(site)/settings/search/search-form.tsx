"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveSearchSettingsAction } from "@/modules/sites/actions";
import { pageTitle, type Business, type SearchSettings } from "@/modules/sites/search";
import { Button, Card, Field, Input, Label, Notice, Switch, Textarea } from "../../../ui";
import { ImagePicker } from "../../pages/[id]/image-picker";
import { FieldErrors } from "@/lib/field-errors";

/**
 * Settings · Search engines: the sitemap address, how titles read, the
 * picture a shared link gets, Search Console, the business for Google's
 * knowledge panel, extra robots lines, and the hide-everything switch.
 * Autosaves a moment after a change.
 */
export function SearchForm({
  initial,
  siteName,
  siteHost,
  shareImageUrl,
  mediaAvailable,
  canEdit,
}: {
  initial: SearchSettings;
  siteName: string;
  siteHost: string;
  shareImageUrl?: string;
  mediaAvailable: boolean;
  canEdit: boolean;
}) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<string[]>();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sitemap = `https://${siteHost}/sitemap.xml`;

  const save = async (snapshot: SearchSettings) => {
    setStatus("saving");
    const r = await saveSearchSettingsAction(snapshot).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      setError(r.error);
      setFields("fields" in r ? r.fields : undefined);
      setStatus("error");
    } else setStatus("saved");
  };
  const change = (patch: Partial<SearchSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 700);
  };
  const business = (patch: Partial<Business>) => change({ business: { ...s.business, ...patch } });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const ro = !canEdit;
  return (
    <div className="space-y-8">
      {!canEdit && <Notice error="Only an owner can change these. You can still read them." />}
      {s.hideFromSearch && (
        <Card variant="static" className="border border-warning px-4 py-3 text-[13.5px] text-warning">
          This site is hidden from Google. Nobody will find it by searching until you switch that off below.
        </Card>
      )}

      <section>
        <Label>Your sitemap</Label>
        <Card variant="static" className="p-4">
          <p className="break-all font-mono text-[13px] text-text">{sitemap}</p>
          <Button
            type="button"
            variant="quiet"
            size="sm"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard?.writeText(sitemap);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy the address"}
          </Button>
          <p className="mt-3 text-[12.5px] text-muted">A list of your pages for Google. It updates itself. Paste it into Google Search Console once, under Sitemaps — or ask us to.</p>
        </Card>
      </section>

      <section className="space-y-5">
        <Label>In Google</Label>
        <Field label="How page titles read" htmlFor="s-pattern" hint={`[Page name] and [Site name] are swapped in. Right now an About page reads "${pageTitle(s.titlePattern, "About", siteName)}".`}>
          <Input id="s-pattern" data-field="titlePattern" value={s.titlePattern} maxLength={120} readOnly={ro} onChange={(e) => change({ titlePattern: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-[13.5px] text-body">Picture when a link is shared</p>
          <ImagePicker id="s-share" value={s.shareImage ?? undefined} url={shareImageUrl} available={mediaAvailable && canEdit} onChange={(next) => change({ shareImage: next ?? null })} />
          <p className="mt-1.5 text-[12.5px] text-muted">Used when someone shares your site on Facebook or in a message, unless the page has its own.</p>
        </div>
        <Field label="Search Console code" htmlFor="s-console" hint="Only needed if you're setting up Search Console yourself. Paste the whole google-site-verification=… line or just the code.">
          <Input id="s-console" data-field="searchConsole" value={s.searchConsole} maxLength={200} readOnly={ro} autoComplete="off" className="font-mono" onChange={(e) => change({ searchConsole: e.target.value })} />
        </Field>
      </section>

      <section className="space-y-4">
        <Label>Your business, for Google</Label>
        <p className="-mt-2 text-[12.5px] text-muted">
          What the knowledge panel beside search results is told. Your name, phone, email and address come from{" "}
          <Link href="/settings/business" className="underline underline-offset-2">
            Business profile
          </Link>
          , your logo from{" "}
          <Link href="/settings/branding" className="underline underline-offset-2">
            Branding
          </Link>{" "}
          and your social links from{" "}
          <Link href="/settings/footer" className="underline underline-offset-2">
            Footer
          </Link>
          .
        </p>
        <Field label="One-line description" htmlFor="b-desc">
          <Input id="b-desc" data-field="business.description" value={s.business.description} maxLength={300} readOnly={ro} onChange={(e) => business({ description: e.target.value })} />
        </Field>
      </section>

      <section className="space-y-4">
        <Label>Advanced</Label>
        <Field label="Extra lines for robots.txt" htmlFor="s-robots" hint="Allow: and Disallow: lines, one per line. Everything else is written for you.">
          <Textarea id="s-robots" data-field="robotsExtra" value={s.robotsExtra} rows={3} maxLength={2000} readOnly={ro} className="font-mono text-[13px]" placeholder={"Disallow: /old-catalogue/"} onChange={(e) => change({ robotsExtra: e.target.value })} />
        </Field>
        <Switch
          checked={s.hideFromSearch}
          disabled={ro}
          onChange={(v) => change({ hideFromSearch: v })}
          label="Hide the whole site from Google"
          hint="For a site that isn't ready. Leave this on by accident and nobody will ever find you — so we keep a banner in here while it is."
        />
      </section>

      <p className="text-right text-[12px] text-muted" aria-live="polite" data-testid="search-save-status">
        {status === "idle" && canEdit && "Changes save as you type."}
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved"}
        {status === "error" && (
          <button type="button" onClick={() => void save(s)} className="text-alert underline underline-offset-4">
            Retry — {error}
          </button>
        )}
        {status === "error" && <FieldErrors fields={fields} />}
      </p>
    </div>
  );
}
