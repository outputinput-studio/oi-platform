import { z } from "zod";

/**
 * Every environment variable the app reads, validated once at startup.
 * Add a variable here before using it anywhere. Missing or malformed
 * values fail fast with a clear message instead of a mystery at runtime.
 */
const schema = z.object({
  /** The app role: no table ownership, cannot bypass row-level security. */
  DATABASE_URL: z.string().url(),
  /** Where this build is running. Vercel sets VERCEL_ENV; locally it is absent. */
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  /** Our own name for the environment. Staging is a Vercel custom environment. */
  OI_ENV: z.enum(["local", "preview", "staging", "production"]).optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),

  /** Signs session cookies. 32+ random characters, different per environment. */
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  /**
   * Hostnames sign-in may run on, comma separated, wildcards allowed.
   * Production: `*.outputinput.co`. Staging: `*.outputinput.io`. Preview: `*.vercel.app`.
   * Locally and in CI the default covers `admin.localhost:3000`.
   */
  OI_AUTH_HOSTS: z.string().optional(),

  /** When both are set, sign-in codes go out through Resend. Otherwise they are logged. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid environment:\n" + parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
    }
    cached = parsed.data;
  }
  return cached;
}

/** Human name for where we are: local, preview, staging or production. */
export function environmentName(): NonNullable<Env["OI_ENV"]> {
  const e = env();
  if (e.OI_ENV) return e.OI_ENV;
  if (e.VERCEL_ENV === "production") return "production";
  if (e.VERCEL_ENV === "preview") return "preview";
  return "local";
}

/** Hosts that may serve sign-in. */
export function authHosts(): string[] {
  const raw = env().OI_AUTH_HOSTS ?? "localhost,*.localhost,localhost:3000,*.localhost:3000";
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}
