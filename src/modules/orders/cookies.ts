import { environmentName } from "@/lib/env";

/** How the cart cookies are set, wherever they're set from (server actions, the tidy route). */
export function cartCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: environmentName() !== "local", path: "/", maxAge: 60 * 60 * 24 * 30 };
}
