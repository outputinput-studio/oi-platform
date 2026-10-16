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
  // x-forwarded-host first. Vercel sets it to the real host on every request,
  // and Next fills it from Host locally. It matters because when a server
  // action calls redirect(), Next fetches the target page from itself with
  // Host: localhost; only x-forwarded-host still says which site asked.
  const { surface, host } = resolveSurface(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));

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
  // Everything except API routes, Next internals, the root files Next
  // serves itself, and the files in public/. A dotted path like
  // /shop/thing.html is NOT excluded: old links look like that, and the
  // storefront needs to see them to redirect or log them.
  matcher: ["/((?!api|_next|brand/|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)"],
};
