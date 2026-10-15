import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authHosts, env, environmentName } from "@/lib/env";
import { sendEmail } from "@/lib/email";

/**
 * Sign-in for staff and clients: a six-digit code sent by email, no passwords.
 *
 * Accounts are invite-only. `disableSignUp` means an email nobody has added
 * to a site gets a polite refusal instead of a new account, so the people
 * who can reach an admin are exactly the people a site owner put there.
 *
 * This is server-only. Pages and actions call `auth.api.*`; the browser only
 * ever talks to /api/auth through the route handler.
 */
export const auth = betterAuth({
  appName: "output/input",
  secret: env().BETTER_AUTH_SECRET,
  baseURL: {
    allowedHosts: authHosts(),
    protocol: environmentName() === "local" ? "http" : "https",
  },
  database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
  // Email + password is off. Codes only.
  emailAndPassword: { enabled: false },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // a month, refreshed on use
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      allowedAttempts: 5,
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        await sendEmail({
          to: email,
          subject: `${otp} is your output/input sign-in code`,
          text: `Your sign-in code is ${otp}. It works for ten minutes.\n\nIf you did not ask for it, ignore this email.`,
        });
      },
    }),
    // Lets server actions set the session cookie after a successful sign-in.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
