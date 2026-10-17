import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/access";
import { ExportLinkError, openExport, writeArchive } from "@/modules/export/server";
import { ZipWriter } from "@/modules/export/zip";

export const dynamic = "force-dynamic";
// A big site's photos take a while to stream out.
export const maxDuration = 300;

/**
 * The emailed link (Export everything). It needs the person signed in as an
 * Owner of the site too, so a forwarded email alone opens nothing. The zip
 * is written as it downloads.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ siteId: string; token: string }> }): Promise<Response> {
  const user = await requireUser();
  const { siteId, token } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) redirect("/settings/export?link=wrong");
  let filename: string;
  try {
    ({ filename } = await openExport({ actorId: user.id, siteId, token }));
  } catch (err) {
    // Expired or mistyped: back to the page to ask again. Not an Owner of it: Home, like any screen they can't open.
    redirect(err instanceof ExportLinkError ? `/settings/export?link=${err.reason}` : "/");
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const out = writable.getWriter();
  const zip = new ZipWriter((chunk) => out.write(chunk));
  // Written in the background as the browser reads; waiting on each write keeps memory to one file at a time.
  writeArchive(siteId, zip)
    .then(() => out.close())
    .catch((err) => {
      console.error("export:", err instanceof Error ? err.message : err);
      return out.abort(err);
    });
  return new Response(readable, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
