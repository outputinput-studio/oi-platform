"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveProductAction } from "@/modules/products/actions";
import { AVAILABILITY_LABEL, customerView } from "@/modules/products/catalogue";
import type { ProductAvailability, ProductMake } from "@/modules/products/kinds";
import type { ImageRef } from "@/modules/pages/registry";
import type { Seo } from "@/modules/pages/seo";
import { slugFromTitle } from "@/modules/pages/slug";
import { parsePrice, priceInput, type Currency } from "@/modules/sites/shop";
import { Button, Field, Input, Label, PageHeader, Select, Switch, Textarea } from "../../../ui";
import { SeoCard } from "../../seo-card";
import { Photos } from "./photos";

/**
 * The product editor, as in design/admin.html: photos, name, price and
 * sale price, category, physical or digital, how it's made, availability,
 * what customers will see, description, then whether it's on the site,
 * its address and how it looks in Google. Everything autosaves a moment
 * after a change; the header shows one Saved / Saving… / Retry.
 */
export type ProductDraft = {
  name: string;
  slug: string;
  description: string;
  price: number | null;
  salePrice: number | null;
  categoryId: string | null;
  digital: boolean;
  make: ProductMake;
  stock: number | null;
  leadTime: number | null;
  leadUnit: "weeks" | "days";
  availability: ProductAvailability;
  visible: boolean;
  photos: ImageRef[];
  code: string;
};

const AVAILABILITY_HINT: Record<ProductAvailability, string> = {
  forSale: "People can buy it now.",
  sold: "Stays on your site as a past piece, and asks for an enquiry.",
  soldOut: "Set on its own when stock hits zero. You can set it yourself too.",
  enquire: "No cart. People get in touch to order it.",
  comingSoon: "Visible, but not buyable yet.",
};

export function ProductEditor({
  product,
  photoUrls,
  categories,
  currency,
  taxNote,
  siteHost,
  mediaAvailable,
  seo,
  deleteAction,
}: {
  product: ProductDraft & { id: string };
  photoUrls: Record<string, string>;
  categories: { id: string; name: string }[];
  currency: Currency;
  /** "Prices include GST." */
  taxNote: string;
  siteHost: string;
  mediaAvailable: boolean;
  seo: { initial: Seo; imageUrl?: string; fallback: { title: string; description: string; imageUrl?: string } };
  deleteAction: (f: FormData) => Promise<void>;
}) {
  const [d, setD] = useState<ProductDraft>(product);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [priceText, setPriceText] = useState({ price: priceInput(product.price), salePrice: priceInput(product.salePrice) });
  const [priceError, setPriceError] = useState<{ price?: string; salePrice?: string }>({});
  const [wasVisible] = useState(product.visible);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<ProductDraft>>({});

  const save = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setStatus("saving");
    const r = await saveProductAction(product.id, patch).catch(() => ({ error: "couldn't reach the server" }));
    if (r.error) {
      pending.current = { ...patch, ...pending.current };
      setError(r.error);
      setStatus("error");
    } else setStatus("saved");
  }, [product.id]);

  const change = (patch: Partial<ProductDraft>) => {
    setD((cur) => ({ ...cur, ...patch }));
    pending.current = { ...pending.current, ...patch };
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const typePrice = (which: "price" | "salePrice", text: string) => {
    setPriceText((t) => ({ ...t, [which]: text }));
    try {
      const cents = parsePrice(text);
      setPriceError((e) => ({ ...e, [which]: undefined }));
      change({ [which]: cents } as Partial<ProductDraft>);
    } catch (err) {
      setPriceError((e) => ({ ...e, [which]: err instanceof Error ? err.message : "That isn't a price." }));
    }
  };

  const [slugTouched, setSlugTouched] = useState(product.slug !== slugFromTitle(product.name));
  const path = `/shop/${d.slug || "…"}`;
  const view = customerView(d, currency);

  return (
    <>
      <PageHeader
        title="Edit product"
        back="/products"
        actions={
          <span data-testid="product-save-status" className={`text-[13px] ${status === "error" ? "text-alert" : status === "saved" ? "text-success" : "text-muted"}`}>
            {status === "saving" && "Saving…"}
            {status === "saved" && "✓ Saved"}
            {status === "error" && (
              <button type="button" onClick={() => void save()} className="underline underline-offset-4">
                Retry — {error}
              </button>
            )}
          </span>
        }
      />
      <div className="max-w-[640px] space-y-5 pt-5 md:pt-6">
        <div>
          <Label>Photos</Label>
          <Photos value={d.photos} urls={photoUrls} available={mediaAvailable} onChange={(photos) => change({ photos })} />
        </div>

        <Field label="Product name" htmlFor="p-name">
          <Input
            id="p-name"
            value={d.name}
            maxLength={160}
            onChange={(e) => {
              const name = e.target.value;
              change(slugTouched || wasVisible ? { name } : { name, slug: slugFromTitle(name) });
            }}
          />
        </Field>

        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" htmlFor="p-price">
              <Input id="p-price" inputMode="decimal" value={priceText.price} placeholder="Enter a price" className="font-mono" onChange={(e) => typePrice("price", e.target.value)} />
            </Field>
            <Field label="Sale price" htmlFor="p-sale">
              <Input id="p-sale" inputMode="decimal" value={priceText.salePrice} placeholder="Optional" className="font-mono" onChange={(e) => typePrice("salePrice", e.target.value)} />
            </Field>
          </div>
          {(priceError.price || priceError.salePrice) && <p className="mt-1.5 text-[12.5px] text-alert">{priceError.price || priceError.salePrice}</p>}
          <p className="mt-1.5 text-[12.5px] text-muted">
            In {currency}. {taxNote}{" "}
            <Link href="/settings/shop" className="text-accent-text underline underline-offset-4">
              Change in settings
            </Link>
            . A sale price shows with the old price struck through.
          </p>
        </div>

        <Field label="Category" htmlFor="p-category">
          <div className="flex gap-2">
            <Select id="p-category" value={d.categoryId ?? ""} onChange={(e) => change({ categoryId: e.target.value || null })}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Link href="/products/categories" className="flex h-11 flex-none items-center rounded-button border border-line px-3.5 text-[13.5px] text-body hover:bg-hover">
              New category
            </Link>
          </div>
        </Field>

        <div>
          <p className="mb-1.5 text-[13.5px] text-body">Type</p>
          <Segmented
            label="Type"
            value={d.digital ? "digital" : "physical"}
            options={[
              ["physical", "Physical"],
              ["digital", "Digital"],
            ]}
            onChange={(v) => change({ digital: v === "digital" })}
          />
          <p className="mt-1.5 text-[12.5px] text-muted">{d.digital ? "Nothing to post: a download or a voucher." : "Something that gets posted or picked up."}</p>
        </div>

        <div>
          <p className="mb-1.5 text-[13.5px] text-body">How it&apos;s made</p>
          <Segmented
            label="How it's made"
            value={d.make}
            options={[
              ["ready", "Ready to ship"],
              ["madeToOrder", "Made to order"],
              ["oneOnly", "One only"],
            ]}
            onChange={(v) => change({ make: v as ProductMake })}
          />
          <div className="mt-3">
            {d.make === "ready" && (
              <Field label="How many do you have?" htmlFor="p-stock" hint="Comes off sale on its own when it runs out. Leave empty to not count.">
                <Input id="p-stock" inputMode="numeric" className="max-w-[160px] font-mono" value={d.stock ?? ""} onChange={(e) => change({ stock: wholeOrNull(e.target.value) })} />
              </Field>
            )}
            {d.make === "madeToOrder" && (
              <Field label="How long does it take to make?" htmlFor="p-lead" hint={d.leadTime ? `Shows on your site as "Made to order — around ${d.leadTime} ${d.leadTime === 1 ? d.leadUnit.slice(0, -1) : d.leadUnit}".` : "Shows on your site under the price."}>
                <div className="flex gap-2">
                  <Input id="p-lead" inputMode="numeric" className="max-w-[110px] font-mono" value={d.leadTime ?? ""} onChange={(e) => change({ leadTime: wholeOrNull(e.target.value) || null })} />
                  <Segmented
                    label="Weeks or days"
                    value={d.leadUnit}
                    options={[
                      ["weeks", "Weeks"],
                      ["days", "Days"],
                    ]}
                    onChange={(v) => change({ leadUnit: v as "weeks" | "days" })}
                  />
                </div>
              </Field>
            )}
            {d.make === "oneOnly" && <p className="text-[12.5px] text-muted">A single piece. Nothing else to set here — availability below decides whether it can still be bought.</p>}
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13.5px] text-body">Availability</legend>
          <div role="radiogroup" aria-label="Availability" className="space-y-2">
            {(Object.keys(AVAILABILITY_LABEL) as ProductAvailability[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={d.availability === a}
                onClick={() => change({ availability: a })}
                className={`flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left ${d.availability === a ? "border-accent bg-selected" : "border-line bg-surface hover:bg-hover"}`}
              >
                <span className={`mt-[3px] flex h-4 w-4 flex-none items-center justify-center rounded-full border ${d.availability === a ? "border-accent" : "border-control"}`}>
                  {d.availability === a && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span>
                  <span className="block text-[14.5px]">{AVAILABILITY_LABEL[a]}</span>
                  <span className="block text-[12.5px] text-muted">{AVAILABILITY_HINT[a]}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <Label>What customers see</Label>
          <div data-testid="customer-view" className="rounded-card border border-line bg-sunken px-4 py-3.5">
            <p className="font-mono text-[18px]">
              {view.price ?? <span className="text-muted">No price</span>} {view.was && <s className="text-[14px] text-muted">{view.was}</s>}
            </p>
            <p className="mt-1 text-[13px] text-body">{view.note}</p>
            {!d.visible && <p className="mt-1 text-[12px] text-warning">Hidden — only you can see it.</p>}
          </div>
        </div>

        <Field label="Description" htmlFor="p-desc" hint="Leave an empty line between paragraphs.">
          <Textarea id="p-desc" value={d.description} rows={7} onChange={(e) => change({ description: e.target.value })} />
        </Field>

        <Field label="Product code" htmlFor="p-code" hint="Your own reference. Optional; not shown on the site.">
          <Input id="p-code" value={d.code} maxLength={60} className="max-w-[240px] font-mono" onChange={(e) => change({ code: e.target.value })} />
        </Field>

        <div className="rounded-card border border-line bg-surface p-4">
          <Switch checked={d.visible} onChange={(visible) => change({ visible })} label="Visible on site" hint="Turn off to keep working on it without anyone seeing it." />
        </div>

        <div>
          <Label>Address</Label>
          <div className="rounded-card border border-line bg-surface p-4">
            <Field label="Web address" htmlFor="p-slug" hint={`${siteHost}${path}`}>
              <Input
                id="p-slug"
                value={d.slug}
                maxLength={80}
                className="font-mono"
                onChange={(e) => {
                  setSlugTouched(true);
                  change({ slug: e.target.value });
                }}
              />
            </Field>
            {wasVisible && <p className="mt-2 text-[12.5px] text-warning">It&apos;s on your site: the old address will be redirected to the new one.</p>}
          </div>
        </div>

        <SeoCard
          initial={seo.initial}
          imageUrl={seo.imageUrl}
          fallback={seo.fallback}
          host={siteHost}
          path={path}
          mediaAvailable={mediaAvailable}
          onSave={(s) => saveProductAction(product.id, { seo: s })}
        />

        <div>
          <Label className="mt-4">Product settings</Label>
          <form action={deleteAction} className="rounded-card border border-line bg-surface p-4">
            <input type="hidden" name="productId" value={product.id} />
            <Button type="submit" variant="danger" size="sm">
              Delete this product
            </Button>
            <p className="mt-2 text-[12.5px] text-muted">It comes off the site straight away. We keep a copy, so ask us if you need it back.</p>
          </form>
        </div>
      </div>
    </>
  );
}

function wholeOrNull(s: string): number | null {
  const t = s.replace(/[^\d]/g, "");
  return t === "" ? null : Math.min(Number(t), 1_000_000);
}

/** A row of options, one picked: Physical | Digital. */
function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-1 rounded-[6px] border border-line bg-bg p-[3px]">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-[38px] flex-1 rounded-button px-2 text-[14px] ${value === v ? "bg-accent text-text" : "text-muted hover:text-text"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
