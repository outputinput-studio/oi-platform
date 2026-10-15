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

  /**
   * Pictures live in one Cloudflare R2 bucket, every site under its own
   * folder. All five set → uploads go to R2. None set → outside production,
   * files are kept on local disk (tests, previews without a bucket) and
   * served by /api/media-local; in production, uploads are switched off
   * with a clear message rather than silently stored somewhere odd.
   */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  /** Where the bucket is public, no trailing slash: https://pub-xxx.r2.dev or https://media.example.com */
  R2_PUBLIC_URL: z.string().url().optional(),
  /** Local-disk fallback directory (default .media-local in the project). */
  MEDIA_LOCAL_DIR: z.string().optional(),
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

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string };

/**
 * The R2 settings when all five are present, null when none are. Some but
 * not all is a misconfiguration and fails loudly, naming what's missing.
 */
export function r2Config(): R2Config | null {
  const e = env();
  const values = {
    R2_ACCOUNT_ID: e.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: e.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: e.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: e.R2_BUCKET,
    R2_PUBLIC_URL: e.R2_PUBLIC_URL,
  };
  const missing = Object.entries(values)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length === 5) return null;
  if (missing.length > 0) throw new Error(`R2 is half configured. Missing: ${missing.join(", ")}`);
  return {
    accountId: values.R2_ACCOUNT_ID!,
    accessKeyId: values.R2_ACCESS_KEY_ID!,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY!,
    bucket: values.R2_BUCKET!,
    publicUrl: values.R2_PUBLIC_URL!.replace(/\/+$/, ""),
  };
}

/** Hosts that may serve sign-in. */
export function authHosts(): string[] {
  const raw = env().OI_AUTH_HOSTS ?? "localhost,*.localhost,localhost:3000,*.localhost:3000";
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}
