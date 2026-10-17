/** Where the setup project keeps the signed-in owner (cookies only; never committed). */
export const OWNER_STATE = "tests/e2e/.auth/owner.json";

/** For tests about signing in: start with no session at all. */
export const SIGNED_OUT = { cookies: [], origins: [] };
