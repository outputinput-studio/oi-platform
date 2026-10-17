import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { env } from "@/lib/env";
import { secretsAvailable } from "@/lib/secrets";
import { parseSupportEmails } from "./support-list";

/**
 * O/I support access (Carl, Oct 2026): the people at output/input who build,
 * fix and update every site. The addresses live only in OI_SUPPORT_EMAILS on
 * Vercel — never in the database, so nothing in the admin can add one — and
 * each acts as an Owner on every site, always on: a client can't take it
 * away ("Ask us and we'll remove it"). No memberships: new sites are covered
 * the moment they exist.
 *
 * Guarded harder than anyone else: their sign-in always asks for the
 * authenticator app (two-factor.ts), and it counts only once the server can
 * keep authenticator keys (OI_SECRETS_KEY). Without that, support addresses
 * are nobody.
 */

let list: string[] | undefined;
function supportEmails(): string[] {
  if (!list) list = parseSupportEmails(env().OI_SUPPORT_EMAILS);
  return list;
}

/** Does this address look after every site? Only once the app can be required of it. */
export function isSupportEmail(email: string | null | undefined): boolean {
  return !!email && secretsAvailable() && supportEmails().includes(email.toLowerCase());
}

/** For Team: who to ask, or null when no one is set up. */
export function supportContact(): { emails: string[] } | null {
  const emails = secretsAvailable() ? supportEmails() : [];
  return emails.length ? { emails } : null;
}

/**
 * Sign-in is invite-only, and nobody invites us: a support address gets its
 * account the first time it asks for a code. Any other address is left to
 * the usual rule (no account, no code, same screen).
 */
export async function ensureSupportUser(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  if (!isSupportEmail(clean)) return;
  await db
    .insert(users)
    .values({ id: crypto.randomUUID(), name: "output/input", email: clean, emailVerified: true, updatedAt: new Date() })
    .onConflictDoNothing({ target: users.email });
}

/** Is this account one of ours? (By id, for Activity and the checks.) */
export async function isSupportUser(userId: string): Promise<boolean> {
  if (!supportEmails().length) return false;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return isSupportEmail(u?.email);
}
