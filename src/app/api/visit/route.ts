import { NextResponse, type NextRequest } from "next/server";
import { countVisit } from "@/modules/plans/server";
import { siteFromHost } from "@/modules/sites/server";

/**
 * One visit to a live storefront (Settings · Plan, "Visits this month").
 * The page's beacon calls this once per tab session. No cookie, no address
 * kept, nothing about who: a number per site per day. Crawlers that say so
 * aren't counted; a site that isn't live isn't counted.
 */
const BOT = /bot|crawl|spider|slurp|preview|monitor|headless/i;

export async function POST(request: NextRequest) {
  if (BOT.test(request.headers.get("user-agent") ?? "")) return new NextResponse(null, { status: 204 });
  const site = await siteFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "");
  if (site?.launchedAt) await countVisit(site.id);
  return new NextResponse(null, { status: 204 });
}
