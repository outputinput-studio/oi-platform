"use client";

import { useState, useTransition } from "react";
import { saveShippingAction } from "@/modules/sites/actions";
import { RATE_KINDS, zoneGaps, type Rate, type RateKind, type Shipping, type Zone } from "@/modules/sites/shipping";
import { formatPrice, parsePrice, priceInput, type Currency } from "@/modules/sites/shop";
import { Button, Field, Input, Label, Notice, Switch, Textarea } from "../../../ui";

const KIND_LABEL: Record<RateKind, string> = { post: "Post or courier", pickup: "Pick up", local: "Local delivery" };
const KIND_NOTE: Record<RateKind, string> = {
  post: "Sent to their address.",
  pickup: "No address taken. Say where and when in the estimate.",
  local: "You drop it off yourself, to the postcodes you list.",
};
const id = () => Math.random().toString(36).slice(2, 10);

/**
 * The shipping set-up as one editable thing: dispatch time, zones in
 * order (first match wins), rates inside each. Saved with one button so
 * a half-made zone never reaches checkout.
 */
export function ShippingEditor({
  initial,
  currency,
  countries,
  canEdit,
  hasEnquiryForm,
}: {
  initial: Shipping;
  currency: Currency;
  countries: { code: string; name: string }[];
  canEdit: boolean;
  /** Quote requests go through Settings · Enquiries' form; without one they have nowhere to land. */
  hasEnquiryForm: boolean;
}) {
  const [s, setS] = useState<Shipping>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== saved;
  const fmt = (c: number) => formatPrice(c, currency);

  const setZone = (zid: string, patch: Partial<Zone>) => setS((cur) => ({ ...cur, zones: cur.zones.map((z) => (z.id === zid ? { ...z, ...patch } : z)) }));
  const moveZone = (i: number, by: -1 | 1) =>
    setS((cur) => {
      const zones = [...cur.zones];
      const j = i + by;
      if (j < 0 || j >= zones.length) return cur;
      [zones[i], zones[j]] = [zones[j], zones[i]];
      return { ...cur, zones };
    });
  const addZone = () => {
    const z: Zone = { id: id(), name: s.zones.length === 0 ? countries[0]?.name ?? "Home" : "Rest of world", countries: s.zones.length === 0 && countries[0] ? [countries[0].code] : [], everywhere: s.zones.length > 0, rates: [{ id: id(), kind: "post", name: "Standard", price: 0, estimate: "", minTotal: null, maxTotal: null, postcodes: [] }], quote: false, quoteMessage: "" };
    setS((cur) => ({ ...cur, zones: [...cur.zones, z] }));
    setOpen(z.id);
  };
  const save = () =>
    start(async () => {
      const r = await saveShippingAction(s).catch(() => ({ error: "couldn't reach the server" }));
      setState(r);
      if (!r.error) setSaved(JSON.stringify(s));
    });

  return (
    <div className="space-y-6">
      <div>
        <Label>Dispatch time</Label>
        <div className="flex items-center gap-2 rounded-card border border-line bg-surface p-4 text-[14.5px]">
          Posted within
          <Input
            aria-label="Business days"
            inputMode="numeric"
            className="!h-10 w-[70px] font-mono"
            value={String(s.dispatchDays)}
            readOnly={!canEdit}
            onChange={(e) => setS({ ...s, dispatchDays: Math.min(60, Number(e.target.value.replace(/\D/g, "") || 0)) })}
          />
          business days
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">Shown on ready-to-ship products. Made-to-order products use their own timing.</p>
      </div>

      <div>
        <Label>Zones</Label>
        {s.zones.length === 0 && (
          <p className="mb-2 rounded-card border border-warning bg-warning-bg px-4 py-3 text-[13px] text-body">
            No zones yet, so delivery is free everywhere. Add one to charge for postage or to limit where you send.
          </p>
        )}
        <ul className="space-y-2">
          {s.zones.map((z, i) => (
            <li key={z.id} data-testid={`zone-${i}`} className="rounded-card border border-line bg-surface">
              <div className="flex items-center gap-2 p-3 pl-4">
                <button type="button" onClick={() => setOpen(open === z.id ? null : z.id)} aria-expanded={open === z.id} className="min-w-0 flex-1 text-left">
                  <span className="block text-[15px] font-medium">{z.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {z.everywhere ? "Every other country" : z.countries.length ? z.countries.map((c) => countries.find((x) => x.code === c)?.name ?? c).join(", ") : "No countries yet"} · {z.quote ? "Quoted individually" : `${z.rates.length} rate${z.rates.length === 1 ? "" : "s"}`}
                  </span>
                </button>
                {canEdit && (
                  <>
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveZone(i, -1)} className="h-9 w-9 rounded-button text-muted hover:bg-hover disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === s.zones.length - 1} onClick={() => moveZone(i, 1)} className="h-9 w-9 rounded-button text-muted hover:bg-hover disabled:opacity-30">
                      ↓
                    </button>
                  </>
                )}
              </div>
              <ZoneGaps zone={z} fmt={fmt} />
              {open === z.id && <ZoneEditor zone={z} countries={countries} canEdit={canEdit} hasEnquiryForm={hasEnquiryForm} fmt={fmt} onChange={(patch) => setZone(z.id, patch)} onDelete={() => setS((cur) => ({ ...cur, zones: cur.zones.filter((x) => x.id !== z.id) }))} />}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-muted">An address matches the first zone it falls into, so keep the specific ones near the top.</p>
        {canEdit && (
          <button
            type="button"
            onClick={addZone}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-card border border-dashed border-line-strong text-[14.5px] text-body hover:border-accent hover:text-accent-text"
          >
            + Add a zone
          </button>
        )}
        <p className="mt-2 text-[12.5px] text-muted">Digital products skip shipping and never ask for an address.</p>
      </div>

      {canEdit ? (
        <div className="space-y-2">
          <Notice {...state} />
          <Button type="button" disabled={!dirty || pending} onClick={save} className="w-full">
            {pending ? "Saving…" : dirty ? "Save shipping" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted">Only an owner can change this.</p>
      )}
    </div>
  );
}

function ZoneEditor({
  zone: z,
  countries,
  canEdit,
  hasEnquiryForm,
  fmt,
  onChange,
  onDelete,
}: {
  zone: Zone;
  countries: { code: string; name: string }[];
  canEdit: boolean;
  hasEnquiryForm: boolean;
  fmt: (c: number) => string;
  onChange: (patch: Partial<Zone>) => void;
  onDelete: () => void;
}) {
  const [filter, setFilter] = useState("");
  const setRate = (rid: string, patch: Partial<Rate>) => onChange({ rates: z.rates.map((r) => (r.id === rid ? { ...r, ...patch } : r)) });
  const shown = countries.filter((c) => z.countries.includes(c.code) || c.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="space-y-4 border-t border-line-soft p-4">
      <Field label="Zone name" htmlFor={`z-name-${z.id}`} hint="Only you see this. Customers see the rate names.">
        <Input id={`z-name-${z.id}`} value={z.name} maxLength={60} readOnly={!canEdit} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Switch checked={z.everywhere} disabled={!canEdit} onChange={(everywhere) => onChange({ everywhere, countries: everywhere ? [] : z.countries })} label="Every other country" hint="Catches any address no zone above it matched." />
      {!z.everywhere && (
        <fieldset>
          <legend className="mb-1.5 text-[13.5px] text-body">Places it covers</legend>
          <Input aria-label="Find a country" placeholder="Find a country" value={filter} onChange={(e) => setFilter(e.target.value)} className="!h-10 text-[14px]" />
          <div className="mt-2 flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
            {shown.map((c) => {
              const on = z.countries.includes(c.code);
              return (
                <label key={c.code} className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] ${on ? "border-text bg-text text-bg" : "border-line text-body hover:bg-hover"}`}>
                  <input type="checkbox" className="sr-only" checked={on} disabled={!canEdit} onChange={(e) => onChange({ countries: e.target.checked ? [...z.countries, c.code] : z.countries.filter((x) => x !== c.code) })} />
                  {c.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="space-y-3 rounded-card border border-line-soft bg-sunken p-3">
        <Switch checked={z.quote} disabled={!canEdit} onChange={(quote) => onChange({ quote })} label="Quote individually" hint="No payment at checkout. Their details come through as an enquiry so you can price the postage." />
        {z.quote && (
          <>
            <Field label="What they read at checkout" htmlFor={`z-quote-${z.id}`}>
              <Textarea
                id={`z-quote-${z.id}`}
                rows={2}
                maxLength={300}
                value={z.quoteMessage}
                readOnly={!canEdit}
                placeholder={`We'll work out delivery to ${z.everywhere ? "you" : (countries.find((c) => c.code === z.countries[0])?.name ?? "you")} and send you a quote.`}
                onChange={(e) => onChange({ quoteMessage: e.target.value })}
              />
            </Field>
            <p className="text-[12.5px] text-muted">Lands in your Inbox, not Orders. You reply with a price and take payment when they agree.</p>
            {!hasEnquiryForm && (
              <p data-testid="quote-needs-form" className="text-[12.5px] leading-[1.5] text-warning">
                Choose an enquiry form in Settings · Enquiries first. Until then, customers here see the message but can&apos;t send a request.
              </p>
            )}
          </>
        )}
      </div>

      {!z.quote && (
      <div>
        <p className="mb-1.5 text-[13.5px] text-body">Rates</p>
        <div className="space-y-2">
          {z.rates.map((r) => (
            <RateEditor key={r.id} rate={r} canEdit={canEdit} fmt={fmt} onChange={(patch) => setRate(r.id, patch)} onRemove={() => onChange({ rates: z.rates.filter((x) => x.id !== r.id) })} />
          ))}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">The customer picks one of these at checkout, cheapest first.</p>
        {canEdit && (
          <Button type="button" variant="quiet" size="sm" className="mt-2" onClick={() => onChange({ rates: [...z.rates, { id: id(), kind: "post", name: "Express", price: 0, estimate: "", minTotal: null, maxTotal: null, postcodes: [] }] })}>
            Add a rate
          </Button>
        )}
      </div>
      )}
      {canEdit && (
        <button type="button" onClick={onDelete} className="text-[13.5px] text-alert hover:underline">
          Delete this zone
        </button>
      )}
    </div>
  );
}

function RateEditor({ rate: r, canEdit, fmt, onChange, onRemove }: { rate: Rate; canEdit: boolean; fmt: (c: number) => string; onChange: (patch: Partial<Rate>) => void; onRemove: () => void }) {
  const [price, setPrice] = useState(priceInput(r.price));
  const [min, setMin] = useState(priceInput(r.minTotal));
  const [max, setMax] = useState(priceInput(r.maxTotal));
  const [pcText, setPcText] = useState(r.postcodes.join(", "));
  const [err, setErr] = useState("");
  const money = (text: string, set: (s: string) => void, apply: (c: number | null) => void) => {
    set(text);
    try {
      apply(parsePrice(text));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That isn't a price.");
    }
  };
  const conditional = r.minTotal !== null || r.maxTotal !== null;
  return (
    <div className="space-y-3 rounded-card border border-line-soft bg-sunken p-3">
      <div role="radiogroup" aria-label="Kind of rate" className="flex rounded-[6px] border border-line bg-bg p-[3px]">
        {RATE_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={r.kind === k} disabled={!canEdit} onClick={() => onChange({ kind: k })} className={`h-9 flex-1 rounded-button px-1 text-[13px] ${r.kind === k ? "bg-accent text-text" : "text-muted hover:text-text"}`}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted">{KIND_NOTE[r.kind]}</p>
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <Field label="Name they see" htmlFor={`r-name-${r.id}`}>
          <Input id={`r-name-${r.id}`} value={r.name} maxLength={60} readOnly={!canEdit} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="Price" htmlFor={`r-price-${r.id}`}>
          <Input id={`r-price-${r.id}`} inputMode="decimal" className="font-mono" value={price} readOnly={!canEdit} onChange={(e) => money(e.target.value, setPrice, (c) => onChange({ price: c ?? 0 }))} />
        </Field>
      </div>
      <p className="-mt-1 text-[12px] text-muted">At {fmt(0)} checkout shows it as Included.</p>
      <Field label="Delivery estimate" htmlFor={`r-est-${r.id}`} hint="Plain words. Worth filling in — it's the question everyone asks.">
        <Input id={`r-est-${r.id}`} value={r.estimate} maxLength={80} placeholder="3–5 business days" readOnly={!canEdit} onChange={(e) => onChange({ estimate: e.target.value })} />
      </Field>
      {r.kind === "local" && (
        <Field label="Postcodes you deliver to" htmlFor={`r-pc-${r.id}`} hint="Separated by commas.">
          <Textarea
            id={`r-pc-${r.id}`}
            rows={2}
            value={pcText}
            readOnly={!canEdit}
            onChange={(e) => {
              // Keep exactly what's typed (commas, spaces) on screen; save the list it makes.
              setPcText(e.target.value);
              onChange({ postcodes: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 500) });
            }}
          />
        </Field>
      )}
      <Switch
        checked={conditional}
        disabled={!canEdit}
        onChange={(on) => {
          if (!on) {
            setMin("");
            setMax("");
          }
          onChange(on ? { minTotal: 0 } : { minTotal: null, maxTotal: null });
          if (on) setMin("0");
        }}
        label="Only for some order totals"
        hint="How free shipping over an amount is made."
      />
      {conditional && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" htmlFor={`r-min-${r.id}`}>
            <Input id={`r-min-${r.id}`} inputMode="decimal" className="font-mono" value={min} readOnly={!canEdit} onChange={(e) => money(e.target.value, setMin, (c) => onChange({ minTotal: c }))} />
          </Field>
          <Field label="Up to (not including)" htmlFor={`r-max-${r.id}`}>
            <Input id={`r-max-${r.id}`} inputMode="decimal" className="font-mono" value={max} placeholder="No limit" readOnly={!canEdit} onChange={(e) => money(e.target.value, setMax, (c) => onChange({ maxTotal: c }))} />
          </Field>
        </div>
      )}
      {err && <p className="text-[12.5px] text-alert">{err}</p>}
      {canEdit && (
        <button type="button" onClick={onRemove} className="text-[13px] text-alert hover:underline">
          Remove this rate
        </button>
      )}
    </div>
  );
}

/** What this zone can't deliver, said plainly, so checkout never just greys out for a customer. */
function ZoneGaps({ zone, fmt }: { zone: Zone; fmt: (c: number) => string }) {
  const g = zoneGaps(zone);
  const lines = [
    g.noRates && "No rates yet, so customers here can't check out.",
    g.below !== null && `Orders under ${fmt(g.below)} have no delivery option here.`,
    g.from !== null && `Orders of ${fmt(g.from)} or more have no delivery option here.`,
  ].filter(Boolean) as string[];
  if (lines.length === 0) return null;
  return (
    <div data-testid="zone-gap" className="mx-4 mb-3 rounded-[6px] border border-warning bg-warning-bg px-3 py-2 text-[12.5px] leading-[1.5] text-body">
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <p className="text-muted">Add a rate without a limit, or turn a limit off, to cover them.</p>
    </div>
  );
}
