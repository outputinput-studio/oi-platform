import { NextResponse, type NextRequest } from "next/server";
import { environmentName } from "@/lib/env";
import { siteFromHost } from "@/modules/sites/server";
import { PASS_COOKIE, PASS_DAYS, passValid } from "@/modules/sites/launch";

export const dynamic = "force-dynamic";

/**
 * A preview link from the admin (Settings · Domain): checks the pass is
 * this site's, keeps it in a cookie on this address, and opens the site.
 * A wrong or old pass just opens the site as anyone sees it.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("x-oi-host") ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const site = await siteFromHost(host);
  const pass = request.nextUrl.searchParams.get("t") ?? "";
  // Relative, so it stays on whatever address they came in on.
  const res = new NextResponse(null, { status: 303, headers: { location: "/" } });
  if (site && passValid(site.id, pass)) {
    res.cookies.set(PASS_COOKIE, pass, { httpOnly: true, sameSite: "lax", secure: environmentName() !== "local", path: "/", maxAge: PASS_DAYS * 86_400 });
  }
  res.headers.set("cache-control", "no-store");
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
