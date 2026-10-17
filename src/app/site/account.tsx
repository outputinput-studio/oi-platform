import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { Customer, CustomerAddress, Order, Site } from "@/db/schema";
import { COUNTRIES, countryName } from "@/lib/countries";
import { Placeholder } from "@/lib/placeholder";
import { siteMenus, type SiteMenus } from "@/modules/menus/server";
import { siteSearch, siteTheme } from "@/modules/sites/server";
import { storefrontSite } from "@/modules/sites/storefront";
import { pageTitle } from "@/modules/sites/search";
import { formatPrice, homeCountry, readShopSettings, type Currency } from "@/modules/sites/shop";
import { mediaUrl } from "@/modules/media/server";
import { withChoice } from "@/modules/products/options";
import type { OrderItem } from "@/modules/orders/server";
import { readAccountSettings } from "@/modules/customers/settings";
import { CUSTOMER_COOKIE, accountSummary, currentCustomer, customerOrder, customerOrders, customerWaiting, listAddresses } from "@/modules/customers/server";
import { orderLine, timeline } from "@/modules/customers/timeline";
import { addressAction, buyAgainAction, leaveWaitingAction, signOutAction } from "@/modules/customers/actions";
import { Frame, missing } from "./storefront";
import { LocalTime } from "./local-time";
import { TimelineView } from "./timeline-view";
import { DetailsForm, PasswordForm, SignInForm, TrackForm } from "./account-forms";
import { secondaryClass } from "./account-styles";
import { AddressList } from "./address-list";

/**
 * The storefront's account area and Track my order
 * (design/storefront-accounts.html). Four screens off one page — orders,
 * details, addresses, the waiting list — and only when the shop has
 * accounts on. Track my order is always there.
 */

type Ctx = { site: Site; menus: SiteMenus; customer: Customer | null; accounts: ReturnType<typeof readAccountSettings> };

async function context(): Promise<Ctx | null> {
  const { site } = await storefrontSite();
  if (!site) return null;
  const accounts = readAccountSettings(site.accounts);
  const [menus, customer] = await Promise.all([siteMenus({ siteId: site.id }), currentCustomer({ site, token: (await cookies()).get(CUSTOMER_COOKIE)?.value })]);
  return { site, menus, customer, accounts };
}

/** Accounts on, or this address isn't here. */
async function accountContext(path: string): Promise<Ctx | null> {
  const c = await context();
  if (c && !c.accounts.enabled) await missing(c.site.id, path, null);
  return c;
}

/** Signed in, or the sign-in screen (coming back here after). */
async function signedIn(path: string): Promise<(Ctx & { customer: Customer }) | React.ReactElement> {
  const c = await accountContext(path);
  if (!c) return <Placeholder surface="site" />;
  if (!c.customer) return <SignIn ctx={c} next={path} />;
  return c as Ctx & { customer: Customer };
}

function Shell({ ctx, children, back, current = "/account" }: { ctx: Ctx; children: React.ReactNode; back?: boolean; current?: string }) {
  return (
    <Frame site={ctx.site} menus={ctx.menus} current={current}>
      <div className="mx-auto max-w-md pb-10 pt-2 md:pt-6">
        {back && (
          <Link href="/account" className="mb-4 inline-flex items-center gap-1 text-[14px] text-[var(--text-muted)] hover:text-[var(--text)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
            Your account
          </Link>
        )}
        {children}
      </div>
    </Frame>
  );
}

function SignIn({ ctx, next }: { ctx: Ctx; next: string }) {
  return (
    <Shell ctx={ctx}>
      <SignInForm next={next} />
      <Link href="/track" className={`${secondaryClass} mt-8`}>
        Just looking for an order?
      </Link>
    </Shell>
  );
}

// ───────────────────────── the account ─────────────────────────

export async function AccountPage({ next }: { next?: string }) {
  const c = await accountContext("/account");
  if (!c) return <Placeholder surface="site" />;
  const safe = next && /^\/(?![/\\])[^\s]*$/.test(next) ? next : "/account";
  if (!c.customer) return <SignIn ctx={c} next={safe} />;
  const s = await accountSummary({ siteId: c.site.id, customer: c.customer });
  const onTheWay = s.orders.filter((o) => o.paymentStatus === "paid" && (o.status === "sent" || o.status === "inProgress")).length;
  const rows = [
    { href: "/account/orders", title: "Orders", detail: s.orders.length ? `${s.orders.length} order${s.orders.length === 1 ? "" : "s"}${onTheWay ? ` · ${onTheWay === 1 ? "one" : onTheWay} on its way` : ""}` : "None yet" },
    { href: "/account/details", title: "Details", detail: "Name, email and phone" },
    { href: "/account/addresses", title: "Addresses", detail: s.addresses ? `${s.addresses} saved` : "None saved yet" },
    { href: "/account/waiting", title: "Waiting list", detail: s.waiting ? `${s.waiting} piece${s.waiting === 1 ? "" : "s"} you asked about` : "Nothing you're waiting on" },
  ];
  return (
    <Shell ctx={c}>
      <h1 data-testid="account-name" className="text-[30px] font-semibold tracking-[-0.5px]">
        {c.customer.name || "Your account"}
      </h1>
      <p className="mt-1 text-[15px] text-[var(--text-muted)]">{c.customer.email}</p>
      <ul className="mt-6 divide-y divide-[var(--border)] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
        {rows.map((r) => (
          <li key={r.href}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg)]">
              <span className="min-w-0 flex-1">
                <span className="block text-[15.5px]">{r.title}</span>
                <span className="mt-0.5 block text-[13.5px] text-[var(--text-muted)]">{r.detail}</span>
              </span>
              <Chevron />
            </Link>
          </li>
        ))}
      </ul>
      <form action={signOutAction} className="mt-6">
        <button type="submit" className={secondaryClass}>
          Sign out
        </button>
      </form>
    </Shell>
  );
}

function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-[var(--text-muted)]" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

const itemsLine = (o: Order) => {
  const items = o.items as OrderItem[];
  const first = items[0] ? withChoice(items[0].name, items[0].choices) : "";
  return items.length > 1 ? `${first} + ${items.length - 1} more` : first;
};

export async function OrdersPage() {
  const c = await signedIn("/account/orders");
  if (!("site" in c)) return c;
  const list = await customerOrders({ siteId: c.site.id, customer: c.customer });
  return (
    <Shell ctx={c} back>
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Orders</h1>
      {list.length === 0 ? (
        <p className="mt-4 text-[15px] text-[var(--text-muted)]">
          Nothing yet.{" "}
          <Link href="/shop" className="underline underline-offset-4">
            Have a look around the shop
          </Link>
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {list.map((o) => (
            <li key={o.id} data-testid={`account-order-${o.number}`} className="overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
              <Link href={`/account/orders/${o.number}`} className="block px-4 py-3.5 hover:bg-[var(--bg)]">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[13px] text-[var(--text-muted)]">{o.number}</span>
                  <span className="text-[15px]">{formatPrice(o.total, o.currency as Currency)}</span>
                </span>
                <span className="mt-1 block text-[15px]">{itemsLine(o)}</span>
                <span className="mt-0.5 block text-[13.5px] text-[var(--text-muted)]">
                  {orderLine(o)} · <LocalTime iso={(o.paidAt ?? o.createdAt).toISOString()} short />
                </span>
              </Link>
              {o.status === "done" && (
                <form action={buyAgainAction} className="border-t border-[var(--border)]">
                  <input type="hidden" name="number" value={o.number} />
                  <button type="submit" className="h-11 w-full text-[14.5px] hover:bg-[var(--bg)]">
                    Buy again
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

export async function OrderPage({ number }: { number: string }) {
  const c = await signedIn(`/account/orders/${number}`);
  if (!("site" in c)) return c;
  const n = Number(number);
  const o = Number.isInteger(n) && n > 0 ? await customerOrder({ siteId: c.site.id, customer: c.customer, number: n }) : null;
  if (!o) await missing(c.site.id, `/account/orders/${number}`, null);
  const order = o!;
  const cur = order.currency as Currency;
  const items = order.items as OrderItem[];
  const a = order.address as Record<string, string>;
  const ship = order.shipping as { name?: string; kind?: string } | null;
  const t = timeline(order);
  return (
    <Shell ctx={c} back>
      <TimelineView number={order.number} placedAt={(order.paidAt ?? order.createdAt).toISOString()} timeline={t}>
        <ul className="space-y-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-3">
              {it.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                <img src={mediaUrl(it.photo)} alt="" className="h-16 w-14 flex-none rounded-[4px] bg-[var(--bg)] object-cover" />
              ) : (
                <span className="h-16 w-14 flex-none rounded-[4px] bg-[var(--bg)]" />
              )}
              <span className="min-w-0 flex-1 text-[14.5px]">
                {it.qty > 1 ? `${it.qty} × ` : ""}
                {withChoice(it.name, it.choices)}
              </span>
              <span className="text-[14.5px]">{formatPrice(it.unit * it.qty, cur)}</span>
            </li>
          ))}
        </ul>
      </TimelineView>
      {a.line1 && ship?.kind !== "pickup" && (
        <section className="mt-6">
          <h2 className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">Sent to</h2>
          <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed">
            {[order.name, a.line1, a.line2, [a.city, a.state, a.postcode].filter(Boolean).join(" "), countryName(a.country)].filter(Boolean).join("\n")}
          </p>
        </section>
      )}
      <section className="mt-6">
        <h2 className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--text-muted)]">Paid</h2>
        <dl className="mt-2 space-y-1.5 text-[14.5px]">
          <div className="flex justify-between">
            <dt>{items.length === 1 ? "Item" : "Items"}</dt>
            <dd>{formatPrice(order.subtotal, cur)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <dt>Code {order.discountCode}</dt>
              <dd>−{formatPrice(order.discount, cur)}</dd>
            </div>
          )}
          {ship && (
            <div className="flex justify-between">
              <dt>Delivery{ship.name ? ` · ${ship.name.toLowerCase()}` : ""}</dt>
              <dd>{order.shippingPrice ? formatPrice(order.shippingPrice, cur) : "Included"}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-[var(--border)] pt-2 font-medium">
            <dt>Total</dt>
            <dd>{formatPrice(order.total, cur)}</dd>
          </div>
          {order.refunded > 0 && (
            <div className="flex justify-between text-[var(--text-muted)]">
              <dt>Refunded</dt>
              <dd>{formatPrice(order.refunded, cur)}</dd>
            </div>
          )}
        </dl>
        {order.tax > 0 && (
          <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
            {order.total === order.subtotal - order.discount + order.shippingPrice ? `Includes ${order.taxName} of ${formatPrice(order.tax, cur)}.` : `${order.taxName} of ${formatPrice(order.tax, cur)} added.`}
          </p>
        )}
      </section>
    </Shell>
  );
}

export async function DetailsPage({ passwordSaved }: { passwordSaved?: boolean }) {
  const c = await signedIn("/account/details");
  if (!("site" in c)) return c;
  return (
    <Shell ctx={c} back>
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Details</h1>
      {c.accounts.passwords && (
        <Link href="/account/password" data-testid="set-password" className="mt-5 flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 hover:bg-[var(--bg)]">
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px]">{c.customer.passwordHash ? "Change your password" : "Set a password"}</span>
            <span className="mt-0.5 block text-[13.5px] text-[var(--text-muted)]">{passwordSaved ? "✓ Saved. Codes still work too." : "So you can sign in without waiting for a code. You never have to."}</span>
          </span>
          <Chevron />
        </Link>
      )}
      <div className="mt-6">
        <DetailsForm initial={{ name: c.customer.name, email: c.customer.email, phone: c.customer.phone }} />
      </div>
    </Shell>
  );
}

export async function PasswordPage() {
  const c = await signedIn("/account/password");
  if (!("site" in c)) return c;
  if (!c.accounts.passwords) await missing(c.site.id, "/account/password", null);
  return (
    <Shell ctx={c} back>
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">{c.customer.passwordHash ? "Change your password" : "Set a password"}</h1>
      <p className="mb-6 mt-1.5 text-[15px] text-[var(--text-body)]">So you can sign in without waiting for a code. Entirely up to you — codes keep working either way.</p>
      <PasswordForm />
    </Shell>
  );
}

export async function AddressesPage() {
  const c = await signedIn("/account/addresses");
  if (!("site" in c)) return c;
  const list = await listAddresses({ siteId: c.site.id, customer: c.customer });
  const home = homeCountry(readShopSettings(c.site.shop).currency);
  return (
    <Shell ctx={c} back>
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Addresses</h1>
      <div className="mt-5">
        <AddressList addresses={list.map(view)} countries={COUNTRIES} defaults={{ name: c.customer.name, label: "", line1: "", line2: "", city: "", state: "", postcode: "", country: home }} action={addressAction} />
      </div>
      <p className="mt-5 text-[13.5px] text-[var(--text-muted)]">Your default address fills in checkout for you. You can always change it there.</p>
    </Shell>
  );
}

function view(a: CustomerAddress) {
  const x = a.address as Record<string, string>;
  return {
    id: a.id,
    isDefault: a.isDefault,
    label: a.label,
    name: a.name,
    line1: x.line1 ?? "",
    line2: x.line2 ?? "",
    city: x.city ?? "",
    state: x.state ?? "",
    postcode: x.postcode ?? "",
    country: x.country ?? "",
    lines: [x.line1, x.line2, [x.city, x.state, x.postcode].filter(Boolean).join(" "), countryName(x.country ?? "")].filter(Boolean),
  };
}

export async function WaitingPage() {
  const c = await signedIn("/account/waiting");
  if (!("site" in c)) return c;
  const list = await customerWaiting({ siteId: c.site.id, customer: c.customer });
  return (
    <Shell ctx={c} back>
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Waiting list</h1>
      <p className="mt-1.5 text-[15px] text-[var(--text-body)]">We&apos;ll email you once, the day one of these is back. Nothing else.</p>
      {list.length === 0 ? (
        <p className="mt-5 text-[15px] text-[var(--text-muted)]">Nothing you&apos;re waiting on. Sold-out pieces have an &ldquo;Email me when it&apos;s back&rdquo; button.</p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--border)] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface)]">
          {list.map((w) => (
            <li key={w.id} data-testid="waiting-row" className="px-4 py-3.5">
              <Link href={`/shop/${w.slug}`} className="text-[15.5px] hover:underline hover:underline-offset-4">
                {w.name}
              </Link>
              <p className="mt-0.5 text-[13.5px] text-[var(--text-muted)]">
                {w.variant ? `${w.variant.split(" / ").join(" · ")} · ` : ""}sold out · asked <LocalTime iso={w.createdAt.toISOString()} short />
              </p>
              <form action={leaveWaitingAction} className="mt-2">
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" className="text-[14px] underline underline-offset-4">
                  Take me off this
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

// ───────────────────────── Track my order ─────────────────────────

export async function TrackPage() {
  const c = await context();
  if (!c) return <Placeholder surface="site" />;
  return (
    <Shell ctx={c} current="/track">
      <h1 className="text-[30px] font-semibold tracking-[-0.5px]">Track my order</h1>
      <p className="mb-6 mt-1.5 text-[15px] text-[var(--text-body)]">No account needed. Your order number is in your confirmation email.</p>
      <TrackForm accounts={c.accounts.enabled} signedIn={!!c.customer} />
    </Shell>
  );
}

/** Account pages and tracking are for the person looking, not for Google. */
export async function accountMetadata(title: string): Promise<Metadata> {
  const { site } = await storefrontSite();
  if (!site) return { title, robots: { index: false, follow: false } };
  const favicon = siteTheme(site).favicon;
  return {
    title: pageTitle(siteSearch(site).titlePattern, title, site.name),
    robots: { index: false, follow: false },
    ...(favicon ? { icons: { icon: [{ url: mediaUrl(favicon.key) }] } } : {}),
  };
}
