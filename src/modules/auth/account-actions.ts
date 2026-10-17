"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formError } from "@/lib/form-error";
import { requireSignIn } from "./access";
import { updateName } from "./account";
import { signOutOthers, signOutSession } from "./sessions";
import { confirmSetup, freshRecoveryCodes, turnOffTwoFactor } from "./two-factor";

/**
 * Your account and the authenticator app, as server actions. Each one acts
 * on the signed-in person and their own session; nothing names a user.
 */
export type AccountState = { ok?: string; error?: string; fields?: string[]; codes?: string[] };

export async function saveNameAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { user } = await requireSignIn();
  try {
    await updateName(user.id, String(form.get("name") ?? ""));
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err, { field: "name" });
  }
}

/** Setting up: the first code from the app turns it on; the ten recovery codes come back to be shown once. */
export async function confirmTwoFactorAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { user, sessionId } = await requireSignIn();
  try {
    const codes = await confirmSetup(user.id, String(form.get("code") ?? ""), sessionId);
    return { codes };
  } catch (err) {
    return formError(err, { field: "code" });
  }
}

export async function freshCodesAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { user } = await requireSignIn();
  try {
    const codes = await freshRecoveryCodes(user.id, String(form.get("code") ?? ""));
    revalidatePath("/account");
    return { codes };
  } catch (err) {
    return formError(err, { field: "code" });
  }
}

export async function turnOffTwoFactorAction(_prev: AccountState, form: FormData): Promise<AccountState> {
  const { user } = await requireSignIn();
  try {
    await turnOffTwoFactor(user.id, String(form.get("code") ?? ""));
    revalidatePath("/account");
    return { ok: "Two-factor is off." };
  } catch (err) {
    return formError(err, { field: "code" });
  }
}

export async function signOutSessionAction(form: FormData): Promise<void> {
  const { user, sessionId } = await requireSignIn();
  const id = z.string().min(1).parse(form.get("sessionId"));
  if (id !== sessionId) await signOutSession(user.id, id);
  revalidatePath("/account");
}

export async function signOutOthersAction(): Promise<AccountState> {
  const { user, sessionId } = await requireSignIn();
  const n = await signOutOthers(user.id, sessionId);
  revalidatePath("/account");
  return { ok: n ? `Signed out of ${n} other ${n === 1 ? "place" : "places"}.` : "You weren't signed in anywhere else." };
}
