import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { articles, contacts, exportLinks, forms, media, orders, pages, productCategories, products, sections, sites, submissions, users } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { logActivity } from "@/modules/activity/server";
import { readPhotos } from "@/modules/products/catalogue";
import { withChoice } from "@/modules/products/options";
import { filesIn, type Field } from "@/modules/forms/fields";
import { countryName } from "@/lib/countries";
import { emailDelivery, sendEmail } from "@/lib/email";
import { environmentName } from "@/lib/env";
import { storage } from "@/lib/storage";
import { money, toCsv, type Cell } from "./csv";
import { ZipWriter } from "./zip";

/**
 * Export everything (Stage 40, design/admin.html): "One download with your
 * products, orders, contacts, pages, articles and every photo, as ordinary
 * files anyone can open … It is your work. You should be able to walk out
 * with it whenever you like."
 *
 * An Owner asks; we email them a link (Carl: 7 days). The link is only half
 * the key: opening it also needs them signed in as an Owner of the site. The
 * zip is built as it downloads, straight from the database and the photo
 * bucket, so no copy of their customers' details is ever left lying around.
 */

const LINK_DAYS = 7;
const PER_DAY = 5;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A download link that can't be opened: `wrong` (not ours, or mistyped) or `expired`. */
export class ExportLinkError extends AccessError {
  constructor(readonly reason: "wrong" | "expired") {
    super(reason === "expired" ? "That link has run out. Ask for a new one below." : "That download link isn't right. Ask for a new one below.");
  }
}

/** "Export everything": email the Owner a link. Returns the address it went to. */
export async function requestExport(p: { actorId: string; siteId: string; adminOrigin: string }): Promise<{ email: string; devLink?: string }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const [who] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, p.actorId)).limit(1);
  if (!who) throw new AccessError("Sign in again, then ask.");
  const since = new Date(Date.now() - 86_400_000);
  const [{ n }] = await withSite(p.siteId, (tx) => tx.select({ n: sql<number>`count(*)` }).from(exportLinks).where(gt(exportLinks.createdAt, since)));
  if (Number(n) >= PER_DAY) throw new Error("You've asked for this a few times today. Use the link in your email, or try again tomorrow.");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await withSite(p.siteId, (tx) =>
    tx.insert(exportLinks).values({ siteId: p.siteId, tokenHash: hash(token), requestedBy: p.actorId, createdAt: now, expiresAt: new Date(now.getTime() + LINK_DAYS * 86_400_000) }),
  );
  const [site] = await withSite(p.siteId, (tx) => tx.select({ name: sites.name }).from(sites).limit(1));
  const link = `${p.adminOrigin}/export/${p.siteId}/${token}`;
  await sendEmail({
    to: who.email,
    subject: `Your ${site?.name ?? "site"} download is ready`,
    text: [
      `Here's everything from ${site?.name ?? "your site"}: products, orders, contacts, pages, articles and every photo, as ordinary files.`,
      "",
      link,
      "",
      `The link works for ${LINK_DAYS} days, and only when you're signed in. If you didn't ask for this, ignore it.`,
    ].join("\n"),
  });
  await logActivity(p.siteId, p.actorId, { action: "asked for a download of everything", href: "/settings/export" });
  // As with the sign-in code: outside production with no email provider, the link is shown on screen (staging, CI).
  return { email: who.email, devLink: environmentName() !== "production" && emailDelivery() === "console" ? link : undefined };
}

/**
 * Check a link before the download starts: the Owner's, signed in, for this
 * site, not expired. Throws AccessError otherwise.
 */
export async function openExport(p: { actorId: string; siteId: string; token: string }): Promise<{ filename: string }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(p.token)) throw new ExportLinkError("wrong");
  const [link] = await withSite(p.siteId, (tx) => tx.select().from(exportLinks).where(eq(exportLinks.tokenHash, hash(p.token))).limit(1));
  if (!link) throw new ExportLinkError("wrong");
  if (link.expiresAt < new Date()) throw new ExportLinkError("expired");
  await withSite(p.siteId, (tx) => tx.update(exportLinks).set({ downloadedAt: new Date() }).where(eq(exportLinks.id, link.id)));
  const [site] = await withSite(p.siteId, (tx) => tx.select({ slug: sites.slug }).from(sites).limit(1));
  await logActivity(p.siteId, p.actorId, { action: "downloaded everything", href: "/settings/export" });
  return { filename: `${site?.slug ?? "site"}-${new Date().toISOString().slice(0, 10)}.zip` };
}

const extOf = (key: string) => key.slice(key.lastIndexOf("."));
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Write the whole site into the zip. Photos first, so the CSVs can name the files they went in as. */
export async function writeArchive(siteId: string, zip: ZipWriter): Promise<void> {
  const store = storage();
  const missing: string[] = [];
  const fileFor = new Map<string, string>();

  // Every photo in the library, under the name it was uploaded with.
  const photos = await withSite(siteId, (tx) => tx.select().from(media).where(isNull(media.deletedAt)).orderBy(asc(media.createdAt)));
  for (const m of photos) {
    const bytes = store ? await store.get(m.key).catch(() => null) : null;
    if (!bytes) {
      missing.push(m.filename);
      continue;
    }
    const base = m.filename.replace(/\.[^.]+$/, "") || "photo";
    fileFor.set(m.key, await zip.addFile(`photos/${base}${extOf(m.key)}`, bytes, { modified: m.createdAt }));
  }
  const photoNames = (raw: unknown) =>
    readPhotos(raw)
      .map((r) => fileFor.get(r.key) ?? "")
      .filter(Boolean)
      .join("; ");

  // Products.
  const cats = await withSite(siteId, (tx) => tx.select().from(productCategories));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const prods = await withSite(siteId, (tx) => tx.select().from(products).where(isNull(products.deletedAt)).orderBy(asc(products.name)));
  await zip.addFile(
    "products.csv",
    toCsv(
      ["Name", "Web address", "Code", "Price", "Sale price", "Category", "On the site", "Stock", "Availability", "Description", "Photos", "Added"],
      prods.map((r) => [r.name, r.slug, r.code, money(r.price), money(r.salePrice), r.categoryId ? catName.get(r.categoryId) : "", r.visible ? "yes" : "no", r.stock, r.availability, r.description, photoNames(r.photos), day(r.createdAt)]),
    ),
    { compress: true },
  );

  // Orders, and what was in each.
  const ords = await withSite(siteId, (tx) => tx.select().from(orders).orderBy(asc(orders.number)));
  const addr = (a: Record<string, unknown>) =>
    [a.line1, a.line2, a.city, a.state, a.postcode, typeof a.country === "string" && a.country ? countryName(a.country) : ""].filter((x) => typeof x === "string" && x).join(", ");
  await zip.addFile(
    "orders.csv",
    toCsv(
      ["Order", "Placed", "Status", "Payment", "Name", "Email", "Phone", "Address", "Note", "Currency", "Subtotal", "Delivery", "Discount", "Discount code", "Tax", "Total", "Refunded"],
      ords.map((o) => [o.number, o.createdAt, o.status, o.paymentStatus, o.name, o.email, o.phone, addr(o.address ?? {}), o.note, o.currency, money(o.subtotal), money(o.shippingPrice), money(o.discount), o.discountCode, money(o.tax), money(o.total), money(o.refunded)]),
    ),
    { compress: true },
  );
  const lines: Cell[][] = [];
  for (const o of ords) {
    for (const it of (o.items ?? []) as { name: string; qty: number; unit: number; choices?: Parameters<typeof withChoice>[1]; note?: string }[]) {
      lines.push([o.number, withChoice(it.name, it.choices), it.qty, money(it.unit), money(it.unit * it.qty), it.note ?? ""]);
    }
  }
  await zip.addFile("order-items.csv", toCsv(["Order", "Item", "Quantity", "Each", "Line total", "Note"], lines), { compress: true });

  // Contacts.
  await zip.addFile("contacts.csv", await contactsCsvFor(siteId), { compress: true });

  // The inbox: everything sent through the site's forms, and the files people attached.
  const formRows = await withSite(siteId, (tx) => tx.select().from(forms));
  const formName = new Map(formRows.map((f) => [f.id, f.name]));
  const subs = await withSite(siteId, (tx) => tx.select().from(submissions).orderBy(asc(submissions.createdAt)));
  const inbox: Cell[][] = [];
  for (const s of subs) {
    const fields = (s.fields ?? []) as Field[];
    const parts: string[] = [];
    for (const f of fields) {
      const answer = s.answers?.[f.id] ?? "";
      if (f.type === "file") {
        const names: string[] = [];
        for (const file of filesIn(answer)) {
          const bytes = store ? await store.get(file.key).catch(() => null) : null;
          if (bytes) names.push(await zip.addFile(`form-uploads/${day(s.createdAt)} ${file.name}`, bytes, { modified: s.createdAt }));
          else missing.push(file.name);
        }
        parts.push(`${f.label}: ${names.join(", ")}`);
      } else if (answer) parts.push(`${f.label}: ${answer}`);
    }
    inbox.push([s.createdAt, formName.get(s.formId) ?? "", s.status, parts.join(" | ")]);
  }
  await zip.addFile("inbox.csv", toCsv(["Received", "Form", "Status", "What they sent"], inbox), { compress: true });

  // Pages: each one with its sections, as JSON (opens in any text editor).
  const pageRows = await withSite(siteId, (tx) => tx.select().from(pages).where(isNull(pages.deletedAt)).orderBy(asc(pages.position)));
  const secs = await withSite(siteId, (tx) => tx.select().from(sections).orderBy(asc(sections.position)));
  for (const pg of pageRows) {
    const body = { title: pg.title, address: `/${pg.slug}`, status: pg.status, seo: pg.seo, sections: secs.filter((x) => x.pageId === pg.id).map((x) => ({ type: x.type, ...x.data })) };
    await zip.addFile(`pages/${pg.slug || "home"}.json`, JSON.stringify(body, null, 2), { compress: true });
  }

  // Articles, as text.
  const arts = await withSite(siteId, (tx) => tx.select().from(articles).where(isNull(articles.deletedAt)).orderBy(desc(articles.publishedAt)));
  for (const a of arts) {
    const text = [`# ${a.title}`, "", [day(a.publishedAt), a.author, a.status].filter(Boolean).join(" · "), "", a.excerpt ? `${a.excerpt}\n` : "", typeof a.body === "string" ? a.body : JSON.stringify(a.body, null, 2)].join("\n");
    await zip.addFile(`articles/${a.slug || "article"}.md`, text, { compress: true });
  }

  const [site] = await withSite(siteId, (tx) => tx.select({ name: sites.name }).from(sites).limit(1));
  await zip.addFile(
    "README.txt",
    [
      `${site?.name ?? "Your site"} — everything, ${new Date().toISOString().slice(0, 10)}`,
      "",
      "products.csv, orders.csv, order-items.csv, contacts.csv, inbox.csv — open in Excel, Numbers or Google Sheets.",
      "pages/ — each page and its sections (open in any text editor).",
      "articles/ — your journal, one file per article.",
      "photos/ — every photo in your library, as uploaded.",
      "form-uploads/ — files people sent through your forms.",
      ...(missing.length ? ["", `These files couldn't be found to include: ${missing.join(", ")}.`] : []),
    ].join("\r\n"),
    { compress: true },
  );
  await zip.finish();
}

/** Contacts as CSV: who they are, what they've bought, and when they first came in. */
async function contactsCsvFor(siteId: string, onlyId?: string, q?: string): Promise<string> {
  const like = q ? `%${q}%` : "";
  const rows = await withSite(siteId, (tx) =>
    tx
      .select()
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          onlyId ? eq(contacts.id, onlyId) : undefined,
          q ? or(ilike(contacts.name, like), ilike(contacts.email, like), ilike(contacts.phone, like), sql`${contacts.notes}::text ilike ${like}`) : undefined,
        ),
      )
      .orderBy(asc(contacts.name)),
  );
  // What each has bought (paid orders, less refunds) and sent: counted per contact, then matched up.
  const bought = await withSite(siteId, (tx) =>
    tx
      .select({ id: orders.contactId, n: sql<number>`count(*)`, spent: sql<number>`coalesce(sum(${orders.total} - ${orders.refunded}), 0)` })
      .from(orders)
      .where(eq(orders.paymentStatus, "paid"))
      .groupBy(orders.contactId),
  );
  const sent = await withSite(siteId, (tx) => tx.select({ id: submissions.contactId, n: sql<number>`count(*)` }).from(submissions).groupBy(submissions.contactId));
  const buys = new Map(bought.map((b) => [b.id, b]));
  const enquiries = new Map(sent.map((x) => [x.id, Number(x.n)]));
  return toCsv(
    ["Name", "Email", "Phone", "Notes", "Orders", "Total spent", "Enquiries", "First came in"],
    rows.map((c) => [
      c.name,
      c.email,
      c.phone,
      (c.notes ?? []).map((n) => `${n.at.slice(0, 10)}: ${n.text}`).join(" / "),
      Number(buys.get(c.id)?.n ?? 0),
      money(Number(buys.get(c.id)?.spent ?? 0)),
      enquiries.get(c.id) ?? 0,
      day(c.createdAt),
    ]),
  );
}

/**
 * Contacts · "Export this list as CSV" (and one contact's own). Managers and
 * Owners: a whole customer list in one file is worth more care than viewing
 * it, so Staff (who can see contacts) can't take it away.
 */
export async function exportContacts(p: { actorId: string; siteId: string; q?: string; contactId?: string }): Promise<string> {
  await assertAccess(p.actorId, p.siteId, "manager");
  const q = (p.q ?? "").trim().slice(0, 100);
  const id = p.contactId && /^[0-9a-f-]{36}$/i.test(p.contactId) ? p.contactId : undefined;
  const csv = await contactsCsvFor(p.siteId, id, q || undefined);
  await logActivity(p.siteId, p.actorId, { action: id ? "exported a contact" : "exported {s}", subject: id ? undefined : q ? `contacts matching “${q}”` : "the contact list", href: "/contacts", key: `export-contacts:${p.actorId}` });
  return csv;
}
