"use client";

import { useState } from "react";
import { linkSchema, type LinkTargets, type MenuLink } from "@/modules/menus/items";
import { Button, Input, Pill, Sheet, Switch } from "../../../ui";

type Step = "root" | "page" | "articleCategory" | "article" | "productCategory" | "product";

/**
 * "Where should it go?", as in design/admin.html: your site, the journal,
 * the shop, or somewhere else. Picking a kind lists what there is of it;
 * a web address is typed in place. The cart joins when checkout does.
 */
export function LinkPicker({ targets, onPick, onClose }: { targets: LinkTargets; onPick: (link: MenuLink, title: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("root");
  const [url, setUrl] = useState("https://");
  const [newTab, setNewTab] = useState(true);
  const [error, setError] = useState("");

  const applyUrl = () => {
    const r = linkSchema.safeParse({ type: "url", url, newTab });
    if (!r.success) return setError(r.error.issues[0]?.message ?? "That doesn't look like a web address.");
    onPick(r.data, "");
  };

  if (step === "page")
    return (
      <Sheet title="A page" onClose={onClose}>
        <Back onClick={() => setStep("root")} />
        {targets.pages.length === 0 ? (
          <Empty>No pages yet.</Empty>
        ) : (
          <Choices>
            {targets.pages.map((p) => (
              <Choice key={p.id} title={p.title} detail={p.path} badge={p.live ? undefined : "Draft"} onClick={() => onPick({ type: "page", pageId: p.id }, p.title)} />
            ))}
          </Choices>
        )}
      </Sheet>
    );
  if (step === "productCategory")
    return (
      <Sheet title="A product category" onClose={onClose}>
        <Back onClick={() => setStep("root")} />
        {targets.productCategories.length === 0 ? (
          <Empty>No categories yet. Add them under Products → Categories.</Empty>
        ) : (
          <Choices>
            {targets.productCategories.map((c) => (
              <Choice key={c.id} title={c.name} detail={c.path} onClick={() => onPick({ type: "productCategory", categoryId: c.id }, c.name)} />
            ))}
          </Choices>
        )}
      </Sheet>
    );
  if (step === "product")
    return (
      <Sheet title="A product" onClose={onClose}>
        <Back onClick={() => setStep("root")} />
        {targets.products.length === 0 ? (
          <Empty>No products yet.</Empty>
        ) : (
          <Choices>
            {targets.products.map((p) => (
              <Choice key={p.id} title={p.title} detail={p.path} badge={p.live ? undefined : "Hidden"} onClick={() => onPick({ type: "product", productId: p.id }, p.title)} />
            ))}
          </Choices>
        )}
      </Sheet>
    );
  if (step === "articleCategory")
    return (
      <Sheet title="An article category" onClose={onClose}>
        <Back onClick={() => setStep("root")} />
        {targets.categories.length === 0 ? (
          <Empty>No categories yet. Add them under Articles → Categories.</Empty>
        ) : (
          <Choices>
            {targets.categories.map((c) => (
              <Choice key={c.id} title={c.name} detail={c.path} onClick={() => onPick({ type: "articleCategory", categoryId: c.id }, c.name)} />
            ))}
          </Choices>
        )}
      </Sheet>
    );
  if (step === "article")
    return (
      <Sheet title="An article" onClose={onClose}>
        <Back onClick={() => setStep("root")} />
        {targets.articles.length === 0 ? (
          <Empty>No articles yet.</Empty>
        ) : (
          <Choices>
            {targets.articles.map((a) => (
              <Choice key={a.id} title={a.title} detail={a.path} badge={a.live ? undefined : "Draft"} onClick={() => onPick({ type: "article", articleId: a.id }, a.title)} />
            ))}
          </Choices>
        )}
      </Sheet>
    );

  return (
    <Sheet title="Where should it go?" onClose={onClose}>
      <Group label="Your site">
        <Choice icon={<PageIcon />} title="A page" detail={capitalise(targets.pages.slice(0, 3).map((p) => p.title.toLowerCase()).join(", ")) || "Home, about, contact"} onClick={() => setStep("page")} more />
        <Choice icon={<TagIcon />} title="A product category" detail={targets.productCategories.slice(0, 2).map((c) => c.name).join(", ") || "Bikinis, costumes"} onClick={() => setStep("productCategory")} more />
        <Choice icon={<BagIcon />} title="A product" detail="One piece in particular" onClick={() => setStep("product")} more />
      </Group>
      <Group label="Journal">
        <Choice icon={<BookIcon />} title="The journal" detail="Every article, newest first" onClick={() => onPick({ type: "journal" }, "Journal")} />
        <Choice icon={<TagIcon />} title="An article category" detail={targets.categories.slice(0, 2).map((c) => c.name).join(", ") || "Behind the scenes"} onClick={() => setStep("articleCategory")} more />
        <Choice icon={<DocIcon />} title="An article" detail="A single post" onClick={() => setStep("article")} more />
      </Group>
      <Group label="Shopping">
        <Choice icon={<BagIcon />} title="The shop" detail="Everything for sale" onClick={() => onPick({ type: "shop" }, "Shop")} />
      </Group>
      <Group label="Somewhere else">
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-center gap-3.5">
            <span className="flex w-6 flex-none justify-center text-body">
              <GlobeIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">A web address</span>
              <span className="block text-[12.5px] text-muted">Instagram, a booking service</span>
            </span>
          </div>
          <Input
            aria-label="Web address"
            className="mt-3"
            value={url}
            inputMode="url"
            autoComplete="off"
            onChange={(e) => {
              setUrl(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyUrl();
              }
            }}
          />
          {error && <p className="mt-1.5 text-[12.5px] text-alert">{error}</p>}
          <div className="mt-3">
            <Switch checked={newTab} onChange={setNewTab} label="Opens in a new tab" />
          </div>
          <Button type="button" size="sm" className="mt-3" onClick={applyUrl}>
            Use this address
          </Button>
        </div>
      </Group>
      <Button type="button" variant="quiet" className="mt-5 w-full" onClick={onClose}>
        Cancel
      </Button>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="label mb-2">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Choices({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}
function Choice({ icon, title, detail, badge, more, onClick }: { icon?: React.ReactNode; title: string; detail?: string; badge?: string; more?: boolean; onClick: () => void }) {
  // Lists of pages and articles show an address (mono); the first screen describes (words).
  const isPath = !!detail?.startsWith("/");
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5 text-left hover:bg-hover">
      {icon && <span className="flex w-6 flex-none justify-center text-body">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px]">{title}</span>
          {badge && <Pill tone="neutral">{badge}</Pill>}
        </span>
        {detail && <span className={`block truncate text-muted ${isPath ? "font-mono text-[12px]" : "text-[12.5px]"}`}>{detail}</span>}
      </span>
      {more && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-faint" aria-hidden>
          <path d="m9 6 6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-3 flex items-center gap-1 text-[13.5px] text-muted hover:text-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
      Back
    </button>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-line px-5 py-7 text-center text-[13.5px] text-muted">{children}</p>;
}

const icon = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
function PageIcon() {
  return (
    <svg {...icon}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg {...icon}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg {...icon}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg {...icon}>
      <path d="M6 7h12l-1 14H7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg {...icon}>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
