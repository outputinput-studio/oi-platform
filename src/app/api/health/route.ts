import { NextResponse } from "next/server";
import { ping } from "@/db/client";
import { env, environmentName } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Reports the environment, the commit and whether the database answered. */
export async function GET() {
  let database = false;
  try {
    database = await ping();
  } catch {
    database = false;
  }
  return NextResponse.json(
    {
      ok: database,
      environment: environmentName(),
      commit: env().VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      database,
    },
    { status: database ? 200 : 503 },
  );
}
