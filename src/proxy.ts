import { NextResponse, type NextRequest } from "next/server";
import { resolveSurface, SURFACE_PREFIX } from "@/lib/surface";

/**
 * Routes every request to its surface by rewriting the path:
 *   admin.example.com/orders  →  /admin/orders
 *   ops.example.com/sites     →  /ops/sites
 *   kini.example.com/shop     →  /site/shop
 *
 * Routing is not security. Nothing here authorises anything; that happens
 * inside module functions. This only decides which tree of pages answers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { surface, host } = resolveSurface(request.headers.get("host"));

  // Surface trees are internal. Reaching one directly by path is a 404.
  for (const prefix of Object.values(SURFACE_PREFIX)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = SURFACE_PREFIX[surface] + (pathname === "/" ? "" : pathname);

  const headers = new Headers(request.headers);
  headers.set("x-oi-surface", surface);
  headers.set("x-oi-host", host);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
