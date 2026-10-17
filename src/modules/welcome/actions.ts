"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAccess } from "@/modules/auth/access";
import { finishWelcome, skipSecureNudge } from "./server";

export async function finishWelcomeAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await finishWelcome({ actorId: user.id, siteId: site.id });
  revalidatePath("/");
}

export async function skipSecureNudgeAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await skipSecureNudge({ actorId: user.id, siteId: site.id });
  revalidatePath("/");
}
