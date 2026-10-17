"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { emailDelivery } from "@/lib/email";
import { environmentName } from "@/lib/env";
import { formError } from "@/lib/form-error";
import { auth } from "./server";
import { ACTIVE_SITE_COOKIE, membershipFor, requireHalfSignIn, requireUser } from "./access";
import { verifySecondStep } from "./two-factor";

/**
 * The sign-in conversation, as server actions. The browser posts a form,
 * these run on the server, Better Auth does the work, and the cookie is
 * set by its Next.js plugin. No client-side auth library, no tokens in
 * JavaScript.
 */

export type SignInState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; error?: string; devCode?: string };

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const codeSchema = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().trim().regex(/^\d{6}$/) });

export async function sendCode(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) return { step: "email", error: "That doesn't look like an email address." };
  const { email } = parsed.data;

  // Accounts are invite-only. For an email nobody has added, Better Auth
  // answers success without sending anything, so the page cannot be used
  // to discover who works where. The code step's copy says what to do.
  try {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) return { step: "email", error: "Couldn't send a code just now. Try again in a minute." };
    throw err;
  }

  // Outside production, with no email provider, show the code on screen so
  // staging and CI can sign in. Production never does this.
  let devCode: string | undefined;
  if (environmentName() !== "production" && emailDelivery() === "console") {
    const r = await auth.api.getVerificationOTP({ query: { email, type: "sign-in" }, headers: await headers() });
    devCode = r?.otp ?? undefined;
  }
  return { step: "code", email, devCode };
}

export async function verifyCode(prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = codeSchema.safeParse({ email: form.get("email"), code: form.get("code") });
  const email = prev.step === "code" ? prev.email : String(form.get("email") ?? "");
  if (!parsed.success) return { step: "code", email, error: "That code didn't work. Codes are six digits." };

  try {
    await auth.api.signInEmailOTP({ body: { email: parsed.data.email, otp: parsed.data.code }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      return { step: "code", email, error: "That code didn't work. Check it, or send a new one." };
    }
    throw err;
  }
  redirect("/sites");
}

export type AppCodeState = { error?: string; fields?: string[] };

/**
 * The second step, for people who use an authenticator app: the code it
 * shows, or one of their recovery codes. Only for a session that got past
 * the emailed code; it's that session that's let in.
 */
export async function verifyAppCode(_prev: AppCodeState, form: FormData): Promise<AppCodeState> {
  const { user, sessionId } = await requireHalfSignIn();
  try {
    await verifySecondStep(user.id, sessionId, String(form.get("code") ?? ""));
  } catch (err) {
    return formError(err, { field: "code" });
  }
  redirect("/sites");
}

/** Make a site the one the person is working in. Verified against their memberships. */
export async function chooseSite(form: FormData) {
  const user = await requireUser();
  const siteId = z.string().uuid().safeParse(form.get("siteId"));
  if (!siteId.success || !(await membershipFor(user.id, siteId.data))) redirect("/sites");
  (await cookies()).set(ACTIVE_SITE_COOKIE, siteId.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: environmentName() !== "local",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  (await cookies()).delete(ACTIVE_SITE_COOKIE);
  redirect("/sign-in");
}
