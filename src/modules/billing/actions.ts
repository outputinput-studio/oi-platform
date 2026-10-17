"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireSiteAccess } from "@/modules/auth/access";
import { environmentName } from "@/lib/env";
import { manageBilling, startPaying } from "./server";

export type BillingFormState = { error?: string };

/** Settings · Plan's own address on this admin host, for Stripe to send them back to. */
async function planPage(): Promise<string> {
  const host = (await headers()).get("x-oi-host") ?? "";
  return `${environmentName() === "local" ? "http" : "https"}://${host}/settings/plan`;
}

/** "Set up payment" → Stripe's page (or, with test billing, straight back). */
export async function startPayingAction(): Promise<BillingFormState> {
  const { user, site } = await requireSiteAccess("owner");
  let to: string;
  try {
    to = (await startPaying({ actorId: user.id, siteId: site.id, returnTo: await planPage() })).redirect;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
  redirect(to);
}

/** "Card and invoices" → Stripe's customer page. */
export async function manageBillingAction(): Promise<BillingFormState> {
  const { user, site } = await requireSiteAccess("owner");
  let to: string;
  try {
    to = (await manageBilling({ actorId: user.id, siteId: site.id, returnTo: await planPage() })).redirect;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
  redirect(to);
}
