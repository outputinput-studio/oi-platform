"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveProductAction } from "@/modules/products/actions";
import { AVAILABILITY_LABEL, BUY_WITH_LABEL, customerView } from "@/modules/products/catalogue";
import { PRODUCT_BUY_WITH, type ProductAvailability, type ProductBuyWith, type ProductMake } from "@/modules/products/kinds";
import type { ImageRef } from "@/modules/pages/registry";
import type { Seo } from "@/modules/pages/seo";
import { slugFromTitle } from "@/modules/pages/slug";
import { parsePrice, priceInput, type Currency } from "@/modules/sites/shop";
import { Button, Field, Input, Label, PageHeader, Segmented, Select, Switch, Textarea } from "../../../ui";
import { SeoCard } from "../../seo-card";
import { Photos } from "./photos";
import { DetailRows } from "./detail-rows";
import { OptionsEditor } from "./options-editor";
import { listOptions, upsertVariant, type ProductOption, type Variant } from "@/modules/products/options";
import { FieldErrors } from "@/lib/field-errors";
import { deliveryText, type ProductDetails } from "@/modules/products/details";
import type { DetailRow } from "@/modules/sites/shop";
import type { Shipping } from "@/modules/sites/shipping";
import { NewCategorySheet } from "../categories/category-forms";

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
  buyWith: ProductBuyWith;
  visible: boolean;
  photos: ImageRef[];
  code: string;
  details: ProductDetails;
  options: ProductOption[];
  /** Stored combination settings (see options.ts); saved one at a time from their sheet. */
  variants: Variant[];
};

const AVAILABILITY_HINT: Record<ProductAvailability, string> = {
  forSale: "People can buy it now.",
  sold: "Stays on your site as a past product, with a link to enquire about something like it.",
  soldOut: "Set on its own when stock hits zero. You can set it yourself too.",
  enquire: "No cart. Sends people to your enquiry form with the product named.",
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
  hasEnquiryForm,
  paymentsReady,
  detailRows,
  shipping,
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
  /** Whether Settings · Enquiries has a form, so enquire-only and sold products get a button. */
  hasEnquiryForm: boolean;
  /** The site can take payments, so Add to cart shows. */
  paymentsReady: boolean;
  /** Settings · Product details rows, and Shipping for the delivery row. */
  detailRows: DetailRow[];
  shipping: Shipping;
}) {
  const [d, setD] = useState<ProductDraft>(product);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<string[]>();
  const [priceText, setPriceText] = useState({ price: priceInput(product.price), salePrice: priceInput(product.salePrice) });
  const [priceError, setPriceError] = useState<{ price?: string; salePrice?: string }>({});
  const [wasVisible] = useState(product.visible);
  const [cats, setCats] = useState(categories);
  const [addingCategory, setAddingCategory] = useState(false);
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
      setFields("fields" in r ? r.fields : undefined);
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
  const hasCombos = listOptions(d.options).length > 0;

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
            {status === "error" && <FieldErrors fields={fields} />}
          </span>
        }
      />
      <div className="max-w-[640px] space-y-5 pt-5 md:pt-6">
        <div>
          <Label>Photos</Label>
          <div data-field="photos">
            <Photos value={d.photos} urls={photoUrls} available={mediaAvailable} onChange={(photos) => change({ photos })} />
          </div>
        </div>

        <Field label="Product name" htmlFor="p-name">
          <Input
            id="p-name"
            data-field="name"
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
              <Input id="p-price" data-field="price" aria-invalid={Boolean(priceError.price) || undefined} inputMode="decimal" value={priceText.price} placeholder="Enter a price" className="font-mono" onChange={(e) => typePrice("price", e.target.value)} />
            </Field>
            <Field label="Sale price" htmlFor="p-sale">
              <Input id="p-sale" data-field="salePrice" aria-invalid={Boolean(priceError.salePrice) || undefined} inputMode="decimal" value={priceText.salePrice} placeholder="Optional" className="font-mono" onChange={(e) => typePrice("salePrice", e.target.value)} />
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
            <Select id="p-category" data-field="categoryId" value={d.categoryId ?? ""} onChange={(e) => change({ categoryId: e.target.value || null })}>
              <option value="">None</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <button type="button" onClick={() => setAddingCategory(true)} className="flex h-11 flex-none items-center rounded-button border border-line px-3.5 text-[13.5px] text-body hover:bg-hover">
              New category
            </button>
          </div>
        </Field>
        {addingCategory && (
          <NewCategorySheet
            onClose={() => setAddingCategory(false)}
            onCreated={(c) => {
              setCats((list) => [...list, c]);
              change({ categoryId: c.id });
            }}
          />
        )}

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

        <OptionsEditor
          options={d.options}
          variants={d.variants}
          product={d}
          currency={currency}
          onOptions={(options) => change({ options })}
          onVariant={async (v) => {
            const r = await saveProductAction(product.id, { variant: v }).catch(() => ({ error: "Couldn't reach the server. Try again.", fields: undefined }));
            if (!r.error) setD((cur) => ({ ...cur, variants: upsertVariant(cur.variants, v, cur.options) }));
            return r;
          }}
        />

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
          {hasCombos && <p className="mt-1.5 text-[12.5px] text-muted">Each combination follows this until you change it there. Stock is counted on each combination.</p>}
          <div className="mt-3">
            {d.make === "ready" && !hasCombos && (
              <Field label="How many do you have?" htmlFor="p-stock" hint="Comes off sale on its own when it runs out. Leave empty to not count.">
                <Input id="p-stock" data-field="stock" inputMode="numeric" className="max-w-[160px] font-mono" value={d.stock ?? ""} onChange={(e) => change({ stock: wholeOrNull(e.target.value) })} />
              </Field>
            )}
            {d.make === "madeToOrder" && (
              <Field label="How long does it take to make?" htmlFor="p-lead" hint={d.leadTime ? `Shows on your site as "Made to order — around ${d.leadTime} ${d.leadTime === 1 ? d.leadUnit.slice(0, -1) : d.leadUnit}".` : "Shows on your site under the price."}>
                <div className="flex gap-2">
                  <Input id="p-lead" data-field="leadTime" inputMode="numeric" className="max-w-[110px] font-mono" value={d.leadTime ?? ""} onChange={(e) => change({ leadTime: wholeOrNull(e.target.value) || null })} />
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
          {!hasEnquiryForm && (d.availability === "enquire" || d.availability === "sold") && (
            <p data-testid="no-enquiry-form" className="mt-2 text-[12.5px] leading-[1.5] text-warning">
              No enquiry form is chosen yet, so customers won&apos;t see a button. Choose one in{" "}
              <Link href="/settings/enquiries" className="underline underline-offset-2">
                Settings · Enquiries
              </Link>
              .
            </p>
          )}
        </fieldset>

        {d.availability === "forSale" && (
          <div>
            <p className="mb-1.5 text-[13.5px] text-body">How they buy it</p>
            <Segmented label="How they buy it" value={d.buyWith} options={PRODUCT_BUY_WITH.map((b) => [b, BUY_WITH_LABEL[b][0]])} onChange={(v) => change({ buyWith: v as ProductBuyWith })} />
            <p className="mt-1.5 text-[12.5px] text-muted">{BUY_WITH_LABEL[d.buyWith][1]}</p>
            {!hasEnquiryForm && d.buyWith !== "cart" && (
              <p data-testid="quote-needs-form" className="mt-2 text-[12.5px] leading-[1.5] text-warning">
                Quote requests go through your enquiry form, and none is chosen yet. Choose one in{" "}
                <Link href="/settings/enquiries" className="underline underline-offset-2">
                  Settings · Enquiries
                </Link>
                .
              </p>
            )}
          </div>
        )}

        <div>
          <Label>What customers see</Label>
          <div data-testid="customer-view" className="rounded-card border border-line bg-sunken px-4 py-3.5">
            <p className="font-mono text-[18px]">
              {view.price ?? <span className="text-muted">No price</span>} {view.was && <s className="text-[14px] text-muted">{view.was}</s>}
            </p>
            <p className="mt-1 text-[13px] text-body">{view.note}</p>
            {(view.buyable || view.quotable) && (
              <>
                {/* Only what will really show; a button that's waiting on a setting is dimmed, with why. */}
                <p className="mt-2 flex gap-1.5">
                  {view.buyable && <span className={`rounded-[4px] border border-line px-2 py-0.5 text-[12px] ${paymentsReady ? "text-body" : "text-faint line-through"}`}>Add to cart</span>}
                  {view.quotable && <span className={`rounded-[4px] border border-line px-2 py-0.5 text-[12px] ${hasEnquiryForm ? "text-body" : "text-faint line-through"}`}>Email quote</span>}
                </p>
                {view.buyable && !paymentsReady && <p className="mt-1 text-[12px] text-muted">Add to cart shows once payments are set up.</p>}
                {view.quotable && !hasEnquiryForm && <p className="mt-1 text-[12px] text-muted">Email quote shows once an enquiry form is chosen.</p>}
              </>
            )}
            {!d.visible && <p className="mt-1 text-[12px] text-warning">Hidden — only you can see it.</p>}
          </div>
        </div>

        <Field label="Description" htmlFor="p-desc" hint="Leave an empty line between paragraphs.">
          <Textarea id="p-desc" data-field="description" value={d.description} rows={7} onChange={(e) => change({ description: e.target.value })} />
        </Field>

        <DetailRows rows={detailRows} value={d.details} delivery={deliveryText(shipping, currency, d)} onChange={(details) => change({ details })} errorFields={status === "error" ? fields : undefined} />

        <Field label="Product code" htmlFor="p-code" hint="Your own reference. Optional; not shown on the site.">
          <Input id="p-code" data-field="code" value={d.code} maxLength={60} className="max-w-[240px] font-mono" onChange={(e) => change({ code: e.target.value })} />
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
                data-field="slug"
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
