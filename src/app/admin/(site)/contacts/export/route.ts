import { requireSiteAccess } from "@/modules/auth/access";
import { exportContacts } from "@/modules/export/server";

export const dynamic = "force-dynamic";

/** Contacts · "Export this list as CSV" (what's on screen, search included), or one contact's own. Managers and Owners. */
export async function GET(req: Request): Promise<Response> {
  const { user, site } = await requireSiteAccess("manager");
  const url = new URL(req.url);
  const contactId = url.searchParams.get("id") ?? undefined;
  const csv = await exportContacts({ actorId: user.id, siteId: site.id, q: url.searchParams.get("q") ?? undefined, contactId });
  const name = `${site.slug}-${contactId ? "contact" : "contacts"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
