import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/auth/server";

/**
 * Better Auth's HTTP surface (session lookup, sign-out, and so on).
 * Our own pages use server actions; this exists for the few calls the
 * browser makes directly and for anything that integrates later.
 */
export const { GET, POST } = toNextJsHandler(auth);
