import { z } from "zod";

/**
 * OI_SUPPORT_EMAILS, read strictly: commas or spaces between addresses,
 * case doesn't matter. Something that isn't an address stops the app
 * rather than being skipped, so a typo can never quietly widen or narrow
 * who looks after every site. Pure, for the tests.
 */
export function parseSupportEmails(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const email = part.toLowerCase();
    if (!z.string().email().safeParse(email).success) throw new Error(`OI_SUPPORT_EMAILS: "${part}" isn't an email address.`);
    if (!out.includes(email)) out.push(email);
  }
  return out;
}
