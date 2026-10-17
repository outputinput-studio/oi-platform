import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/auth/server";

/**
 * Better Auth's HTTP surface, cut down to what a browser may call directly.
 * Our own screens sign in, sign out and change things through server
 * actions (src/modules/auth/actions.ts), which check the emailed code and
 * the authenticator app in that order. Leaving Better Auth's other
 * endpoints open (update-user, list-sessions, revoke-sessions…) would let
 * a session that only got past the email skip the app (Stage 38), so
 * everything else answers 404.
 */
const OPEN = new Set(["GET /api/auth/get-session", "GET /api/auth/ok", "POST /api/auth/sign-out"]);
const handler = toNextJsHandler(auth);

function allowed(req: Request): boolean {
  return OPEN.has(`${req.method} ${new URL(req.url).pathname.replace(/\/$/, "")}`);
}

export async function GET(req: Request) {
  return allowed(req) ? handler.GET(req) : new Response("Not found", { status: 404 });
}

export async function POST(req: Request) {
  return allowed(req) ? handler.POST(req) : new Response("Not found", { status: 404 });
}
