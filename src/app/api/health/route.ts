import { NextResponse } from "next/server";
import { ping } from "@/db/client";
import { env, environmentName } from "@/lib/env";
import { secretsAvailable } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * Reports the environment, the commit, whether the database answered, and
 * whether secure storage (OI_SECRETS_KEY: Stripe keys, authenticator apps)
 * is set up. Never a value, only yes or no.
 */
export async function GET() {
  let database = false;
  try {
    database = await ping();
  } catch (err) {
    // Message only, never the connection string. Enough to tell a bad password from a bad host.
    const e = err as { message?: string; cause?: { message?: string; code?: string } };
    console.error("health: database check failed:", e.message, "cause:", e.cause?.code, e.cause?.message);
    database = false;
  }
  return NextResponse.json(
    {
      ok: database,
      environment: environmentName(),
      commit: env().VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      database,
      secureStorage: secretsAvailable(),
    },
    { status: database ? 200 : 503 },
  );
}
