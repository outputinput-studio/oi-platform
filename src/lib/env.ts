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
   * Images live in one Cloudflare R2 bucket, every site under its own
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
  R2_PUBLIC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  /** Local-disk fallback directory (default .media-local in the project). */
  MEDIA_LOCAL_DIR: z.string().optional(),

  /**
   * Encrypts secrets clients give us (their own Stripe keys) before they
   * go in the database: 32 random bytes, base64 (`openssl rand -base64 32`).
   * Different per environment. Not set → keys can't be saved; outside
   * production, checkout then uses test payments.
   */
  OI_SECRETS_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(40, "should be 32 bytes, base64").optional()),

  /**
   * Clients' own domains (Settings · Domain) are added to this Vercel
   * project through Vercel's API. The token is a secret (Vercel → Account
   * settings → Tokens); the ids are not. Not set → domains are saved and
   * their DNS checked, but someone adds them to Vercel by hand.
   * OI_VERCEL_ENVIRONMENT_ID: staging's custom environment, so a domain
   * added from staging points at staging, not production. Unset in production.
   */
  OI_VERCEL_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(10).optional()),
  OI_VERCEL_PROJECT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  OI_VERCEL_TEAM_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  OI_VERCEL_ENVIRONMENT_ID: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),

  /**
   * O/I support (Stage 38): the output/input addresses that look after every
   * site as an Owner, comma separated. Only here, never in the database.
   * Their sign-in always asks for the authenticator app, and they count only
   * once OI_SECRETS_KEY is set. Unset → no support access anywhere.
   */
  OI_SUPPORT_EMAILS: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),

  /**
   * Get help (Stage 41): how clients reach output/input directly, shown under
   * "Or reach us directly". All optional; whatever is unset isn't shown.
   * Messages sent from Get help go to OI_SUPPORT_EMAILS either way — those
   * sign-in addresses are never shown to clients.
   */
  OI_HELP_EMAIL: z.preprocess((v) => (v === "" ? undefined : v), z.email().optional()),
  OI_HELP_PHONE: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(40).optional()),
  OI_HELP_HOURS: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(200).optional()),

  /**
   * Billing (Stage 39b): clients pay output/input for their plan through
   * O/I's own Stripe account — not theirs. A restricted key (Customers,
   * Checkout Sessions, Subscriptions, Customer portal: write; Invoices,
   * Payment methods, Products, Prices: read… see the PR) and the signing
   * secret of the webhook pointed at /api/billing/stripe. Not set → outside
   * production, "Set up payment" uses test billing; in production it waits.
   */
  OI_BILLING_STRIPE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^(sk|rk)_(test|live)_/, "should start sk_ or rk_").optional()),
  OI_BILLING_WEBHOOK_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().startsWith("whsec_", "should start whsec_").optional()),
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

/**
 * The platform's own domains (outputinput.co, outputinput.io, localhost),
 * from the wildcard sign-in hosts. A host under one of these is a site's
 * slug address; anything else is a client's own domain.
 */
export function platformBases(): string[] {
  const bases = authHosts()
    .filter((h) => h.startsWith("*."))
    .map((h) => h.slice(2).split(":")[0].toLowerCase());
  return [...new Set([...bases, "localhost"])];
}
