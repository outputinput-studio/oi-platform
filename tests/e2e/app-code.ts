import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { base32Decode, hotp, STEP_SECONDS } from "../../src/modules/auth/totp";

/**
 * The demo owner's authenticator app, for the tests. The setup project
 * scans (reads) the key off the setup screen and keeps it here, outside
 * git; later tests ask for a code the way a person would open their app.
 * A code works once, so each one is for a 30-second step not used yet,
 * waiting for the clock when the next one is too far ahead.
 */
const FILE = "tests/e2e/.auth/app.json";

type Saved = Record<string, { secret: string; lastStep: number }>;

function load(): Saved {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Saved;
  } catch {
    return {};
  }
}

export function rememberKey(email: string, key: string, usedStep: number) {
  mkdirSync("tests/e2e/.auth", { recursive: true });
  writeFileSync(FILE, JSON.stringify({ ...load(), [email]: { secret: key.replace(/\s/g, ""), lastStep: usedStep } }, null, 2));
}

export function hasKey(email: string): boolean {
  return !!load()[email];
}

const stepNow = () => Math.floor(Date.now() / 1000 / STEP_SECONDS);

/** The six digits the app would show, for a step nobody has used yet. */
export async function appCode(email: string): Promise<string> {
  const saved = load();
  const me = saved[email];
  if (!me) throw new Error(`No authenticator key saved for ${email}. Clear two_factors in the test database and run again.`);
  const step = Math.max(stepNow(), me.lastStep + 1);
  while (step > stepNow() + 1) await new Promise((r) => setTimeout(r, 1000));
  rememberKey(email, me.secret, step);
  return hotp(base32Decode(me.secret), step);
}

/** The step a key's code is for right now (setting up uses the current one). */
export function currentStep(): number {
  return stepNow();
}
