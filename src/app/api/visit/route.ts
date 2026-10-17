import { NextResponse, type NextRequest } from "next/server";
import { countVisit, visitorKey } from "@/modules/plans/server";
import { siteFromHost } from "@/modules/sites/server";

/**
 * One visit to a live storefront (Settings · Plan, "Visits this month").
 * The page's beacon calls this once per tab session, but anyone can call
 * it, so each connection counts once per site per day (`visitorKey`: the
 * address is only ever kept as a keyed hash, and only for today). No
 * cookie, nothing about who: a number per site per day. Crawlers that say
 * so aren't counted; a site that isn't live isn't counted.
 */
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless/i;

export async function POST(request: NextRequest) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const site = await siteFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "");
  if (!site?.launchedAt) return new NextResponse(null, { status: 204 });
  // Vercel sets x-forwarded-for itself (the first address is the visitor's); a client can't choose it there.
  const address = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0];
  await countVisit(site.id, visitorKey(address));
  return new NextResponse(null, { status: 204 });
}
