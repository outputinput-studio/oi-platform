"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptInvitation, askForNewLink } from "./invitations";

/**
 * The join page's two buttons. Signed out on purpose: the link only puts
 * the invited address on the team, and signing in is still that address's
 * own emailed code (and app). So joining hands straight on to sign-in.
 */
export type JoinState = { ok?: string; error?: string };

const tokenSchema = z.string().regex(/^[\w-]{20,100}$/);

export async function joinAction(_prev: JoinState, form: FormData): Promise<JoinState> {
  const token = tokenSchema.safeParse(form.get("token"));
  if (!token.success) return { error: "That invitation link isn't right." };
  let email: string;
  try {
    email = (await acceptInvitation(token.data)).email;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That didn't work. Try again." };
  }
  redirect(`/sign-in?email=${encodeURIComponent(email)}&joined=1`);
}

export async function newLinkAction(_prev: JoinState, form: FormData): Promise<JoinState> {
  const token = tokenSchema.safeParse(form.get("token"));
  if (token.success) await askForNewLink(token.data, (await headers()).get("x-oi-host") ?? "");
  // The same answer either way: it never says whether a link exists.
  return { ok: "If this invitation can be renewed, a new link is on its way to the invited address. It can take a minute." };
}
