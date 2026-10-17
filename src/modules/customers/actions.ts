"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { environmentName } from "@/lib/env";
import { formError } from "@/lib/form-error";
import { visibleSiteFromHost } from "@/modules/sites/storefront";
import { CART_COOKIE, CART_REF_COOKIE, MAX_CART_CHARS, addLine, readCart, writeCart } from "@/modules/orders/cart";
import { cartCookieOptions } from "@/modules/orders/cookies";
import { orderForCustomer, priceCart } from "@/modules/orders/server";
import { randomUUID } from "node:crypto";
import {
  CUSTOMER_COOKIE,
  againLines,
  beginSignIn,
  currentCustomer,
  customerOrder,
  deleteAddress,
  finishEmailChange,
  leaveWaiting,
  makeDefaultAddress,
  saveAddress,
  sendCode,
  setPassword,
  signInWithCode,
  signInWithPassword,
  signOut,
  startEmailChange,
  updateDetails,
  type SendResult,
  type SignInFailed,
} from "./server";
import { SESSION_DAYS } from "./secrets";
import { waitText } from "@/lib/time";
import { trackOrder, type Tracked } from "./track";

/**
 * The storefront's account screens and Track my order, as server actions.
 * The site is the one the hostname names; the customer is whoever the
 * session cookie on that address belongs to — never an id from the form.
 */

async function here() {
  const h = await headers();
  const site = await visibleSiteFromHost(h.get("x-oi-host") ?? h.get("host") ?? "");
  if (!site) throw new Error("This shop isn't available.");
  // Who's asking, for the limit on codes from one connection. Vercel sets this; the first address is the visitor's.
  const requester = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim();
  return { site, requester };
}

async function signedIn() {
  const { site, requester } = await here();
  const customer = await currentCustomer({ site, token: (await cookies()).get(CUSTOMER_COOKIE)?.value });
  if (!customer) redirect("/account");
  return { site, customer, requester };
}

async function keepSession(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: environmentName() !== "local", path: "/", maxAge: SESSION_DAYS * 86_400 });
}

/** Only somewhere on this shop: a path, never another site. */
function safeNext(raw: unknown): string {
  const n = String(raw ?? "");
  return /^\/(?![/\\])[^\s]*$/.test(n) && n.length < 300 ? n : "/account";
}

// ───────────────────────── signing in ─────────────────────────

export type SignInState = {
  step: "email" | "code" | "password";
  email?: string;
  next: string;
  /** When another code may be asked for (ms since 1970). */
  resendAt?: number;
  /** What happened last, for the screen to say. */
  notice?: "wrong" | "expired" | "locked" | "busy" | "sent";
  /** Seconds to wait, for "locked" and "busy". */
  wait?: number;
  devCode?: string;
  error?: string;
  fields?: string[];
};

function afterSend(prev: SignInState, email: string, r: SendResult): SignInState {
  if (r.ok) return { step: "code", email, next: prev.next, resendAt: Date.now() + r.resendIn * 1000, notice: "sent", ...(r.devCode ? { devCode: r.devCode } : {}) };
  if (r.why === "resend") return { ...prev, step: "code", email, resendAt: Date.now() + r.wait * 1000, notice: undefined, error: undefined };
  return { ...prev, step: "code", email, notice: r.why === "locked" ? "locked" : "busy", wait: r.wait, error: undefined, devCode: undefined };
}

function afterFail(prev: SignInState, r: SignInFailed): SignInState {
  return { ...prev, notice: r.why, wait: r.wait, error: undefined, devCode: r.why === "locked" || r.why === "expired" ? undefined : prev.devCode };
}

/**
 * Every step of signing in through one action, by `intent`: the email, a
 * code, a password, another code, or a code instead of the password.
 */
export async function signInAction(prev: SignInState, form: FormData): Promise<SignInState> {
  const intent = String(form.get("intent") ?? "email");
  const next = safeNext(form.get("next") ?? prev.next);
  let token: string;
  try {
    const { site, requester } = await here();
    // The box only a bot fills in: it gets the next screen and nothing is sent.
    if (String(form.get("website") ?? "")) return { step: "code", email: String(form.get("email") ?? ""), next, notice: "sent", resendAt: Date.now() + 30_000 };
    if (intent === "email") {
      const r = await beginSignIn({ site, email: String(form.get("email") ?? ""), requester });
      return r.step === "password" ? { step: "password", email: r.email, next } : afterSend({ step: "code", next }, r.email, r.sent);
    }
    const email = String(prev.email ?? form.get("email") ?? "");
    if (intent === "resend" || intent === "useCode") return afterSend({ ...prev, next }, email, await sendCode({ site, email, requester }));
    if (intent === "password") {
      const r = await signInWithPassword({ site, email, password: String(form.get("password") ?? "") });
      if (!r.ok) return afterFail({ ...prev, next }, r);
      token = r.token;
    } else {
      const r = await signInWithCode({ site, email, code: String(form.get("code") ?? "").replace(/\s/g, "") });
      if (!r.ok) return afterFail({ ...prev, next }, r);
      token = r.token;
    }
  } catch (err) {
    return { ...prev, next, ...formError(err, { fallback: "Something went wrong. Try again." }), notice: undefined };
  }
  await keepSession(token);
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const { site } = await here();
  const jar = await cookies();
  await signOut({ siteId: site.id, token: jar.get(CUSTOMER_COOKIE)?.value });
  jar.delete(CUSTOMER_COOKIE);
  redirect("/account");
}

// ───────────────────────── their details ─────────────────────────

export type FormState = { ok?: string; error?: string; fields?: string[]; verify?: string; devCode?: string; notice?: string };

/** Name and phone save straight away; a new email waits for the code sent to it. */
export async function saveDetailsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { site, customer, requester } = await signedIn();
  try {
    await updateDetails({ siteId: site.id, customer, name: String(form.get("name") ?? ""), phone: String(form.get("phone") ?? "") });
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    revalidatePath("/account", "layout");
    if (!email || email === customer.email) return { ok: "Saved" };
    const r = await startEmailChange({ site, customer, email, requester });
    if (!r.ok) return { error: r.why === "resend" ? `A code just went to ${email}. Use that one, or ask again in ${waitText(r.wait)}.` : `Too many codes for now. Try again in ${waitText(r.wait)}.`, fields: ["email"] };
    return { ok: "Saved", verify: email, ...(r.devCode ? { devCode: r.devCode } : {}) };
  } catch (err) {
    return formError(err, { fallback: "Check the details and try again." });
  }
}

export async function confirmEmailAction(prev: FormState, form: FormData): Promise<FormState> {
  const { site, customer } = await signedIn();
  // The new address rides along with the code; the code itself is what proves it (it was sent there, for this account).
  const email = String(form.get("verify") ?? prev.verify ?? "");
  try {
    const r = await finishEmailChange({ site, customer, email, code: String(form.get("code") ?? "").replace(/\s/g, "") });
    if (!r.ok)
      return {
        ...prev,
        verify: email,
        error: r.why === "wrong" ? "That code isn't right. Check the email again — the newest one is the one that works." : r.why === "expired" ? "That code has run out. Save the new email again for a fresh one." : `Too many tries. Try again in ${waitText(r.wait ?? 120)}.`,
        fields: ["code"],
        devCode: r.why === "wrong" ? prev.devCode : undefined,
      };
  } catch (err) {
    return { ...prev, ...formError(err, { fallback: "Check the code and try again." }) };
  }
  revalidatePath("/account", "layout");
  return { ok: `Your email is now ${email}.` };
}

export async function setPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { site, customer } = await signedIn();
  try {
    await setPassword({ site, customer, password: String(form.get("password") ?? "") });
  } catch (err) {
    return formError(err, { field: "password", fallback: "Check the password and try again." });
  }
  redirect("/account/details?password=saved");
}

// ───────────────────────── addresses ─────────────────────────

export async function saveAddressAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { site, customer } = await signedIn();
  const s = (k: string) => String(form.get(k) ?? "");
  const id = s("id");
  try {
    await saveAddress({
      siteId: site.id,
      customer,
      ...(id ? { id: z.string().uuid().parse(id) } : {}),
      input: { label: s("label"), name: s("name"), line1: s("line1"), line2: s("line2"), city: s("city"), state: s("state"), postcode: s("postcode"), country: s("country") },
    });
  } catch (err) {
    return formError(err, { fallback: "Check the address and try again." });
  }
  revalidatePath("/account", "layout");
  return { ok: "Saved" };
}

export async function addressAction(form: FormData): Promise<void> {
  const { site, customer } = await signedIn();
  const id = z.string().uuid().parse(form.get("id"));
  if (form.get("intent") === "delete") await deleteAddress({ siteId: site.id, customer, id });
  else await makeDefaultAddress({ siteId: site.id, customer, id });
  revalidatePath("/account", "layout");
}

export async function leaveWaitingAction(form: FormData): Promise<void> {
  const { site, customer } = await signedIn();
  await leaveWaiting({ siteId: site.id, customer, id: String(form.get("id") ?? "") });
  revalidatePath("/account", "layout");
}

/** Buy again: that order's pieces into the cart, then the cart (which says if anything can't be had now). */
export async function buyAgainAction(form: FormData): Promise<void> {
  const { site, customer } = await signedIn();
  const number = z.coerce.number().int().positive().parse(form.get("number"));
  const order = await customerOrder({ siteId: site.id, customer, number });
  if (!order) redirect("/account/orders");
  const jar = await cookies();
  let lines = readCart(jar.get(CART_COOKIE)?.value);
  for (const l of await againLines({ siteId: site.id, order })) {
    const added = addLine(lines, l, 1);
    if (writeCart(added).length > MAX_CART_CHARS) break;
    lines = added;
  }
  const priced = await priceCart({ site, cart: lines, cartRef: jar.get(CART_REF_COOKIE)?.value });
  const opts = cartCookieOptions();
  jar.set(CART_COOKIE, writeCart(priced.tidy), opts);
  if (!jar.get(CART_REF_COOKIE)?.value) jar.set(CART_REF_COOKIE, randomUUID(), opts);
  revalidatePath("/", "layout");
  redirect("/shop/cart");
}

// ───────────────────────── Track my order, and a code from the thank-you page ─────────────────────────

export type TrackState = { order?: Tracked; email?: string; error?: string; fields?: string[] };

export async function trackAction(_prev: TrackState, form: FormData): Promise<TrackState> {
  try {
    const { site } = await here();
    const email = String(form.get("email") ?? "");
    const r = await trackOrder({ siteId: site.id, number: String(form.get("number") ?? ""), email });
    if (r.found) return { order: r.order, email: email.trim().toLowerCase() };
    return {
      error: r.wait ? `Too many tries for that email. Try again in ${waitText(r.wait)}, or send us a message and we'll look for you.` : "We can't find an order with those two together. Check the number, or send us a message and we'll look for you.",
      fields: ["number", "email"],
    };
  } catch (err) {
    return formError(err, { fallback: "Check the details and try again." });
  }
}

/**
 * "Email me a code" after paying: to the email on that order (by its
 * unguessable id, as the thank-you page has it), so they can see it later.
 */
export async function codeForOrderAction(prev: SignInState, form: FormData): Promise<SignInState> {
  try {
    const { site, requester } = await here();
    const order = await orderForCustomer({ siteId: site.id, orderId: String(form.get("orderId") ?? "") });
    if (!order || !["paid", "refunded"].includes(order.paymentStatus)) return { ...prev, error: "We couldn't find that order." };
    const email = order.email.toLowerCase();
    return afterSend({ ...prev, step: "code", next: `/account/orders/${order.number}` }, email, await sendCode({ site, email, requester }));
  } catch (err) {
    return { ...prev, ...formError(err, { fallback: "Couldn't send a code just now. Try again." }) };
  }
}
