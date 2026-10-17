"use server";

import { headers } from "next/headers";
import { requireSiteAccess } from "@/modules/auth/access";
import { environmentName } from "@/lib/env";
import { requestExport } from "./server";

export type ExportFormState = { ok?: string; error?: string; devLink?: string };

/** Settings · Export everything → "Start the download": we email the Owner a link. */
export async function requestExportAction(): Promise<ExportFormState> {
  const { user, site } = await requireSiteAccess("owner");
  const host = (await headers()).get("x-oi-host") ?? "";
  try {
    const r = await requestExport({ actorId: user.id, siteId: site.id, adminOrigin: `${environmentName() === "local" ? "http" : "https"}://${host}` });
    return { ok: `Check your email. The link is on its way to ${r.email} and works for 7 days.`, devLink: r.devLink };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}
