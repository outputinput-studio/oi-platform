"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSiteAccess } from "@/modules/auth/access";
import { disconnectStripe, startStripeConnect } from "./server";

/** "Connect Stripe" / "Finish in Stripe": off to Stripe's own onboarding, back to Settings · Payments. */
export async function connectStripeAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  const host = (await headers()).get("x-oi-host") ?? "";
  const back = `https://${host}/settings/payments`;
  const url = await startStripeConnect({ actorId: user.id, siteId: site.id, returnUrl: `${back}?from=stripe`, refreshUrl: `${back}?from=stripe` });
  redirect(url);
}

export async function disconnectStripeAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await disconnectStripe({ actorId: user.id, siteId: site.id });
  revalidatePath("/", "layout");
  redirect("/settings/payments");
}
