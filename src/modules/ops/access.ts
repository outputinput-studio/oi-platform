import { redirect } from "next/navigation";
import type { User } from "@/db/schema";
import { requireSignIn } from "@/modules/auth/access";
import { isSupportEmail } from "@/modules/auth/support";

/**
 * Every ops page and action starts here (design/operations.html: "This login
 * reaches every client's orders, customers and payout details. Two-factor is
 * required, not optional."). Signed in, an O/I support address, and past the
 * authenticator app — or set it up first. Anyone else is told it's ours.
 * The module functions check support again: this only decides what renders.
 */
export async function requireOps(): Promise<User> {
  const { user, twoFactorOn } = await requireSignIn();
  if (!isSupportEmail(user.email)) redirect("/not-ours");
  if (!twoFactorOn) redirect("/two-factor");
  return user;
}
