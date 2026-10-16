import { z } from "zod";

/**
 * Settings · Customer accounts. Off until the team turns it on: then the
 * storefront gets a person icon, a sign-in that emails a code, and an
 * account area. Passwords are a second, optional switch — codes keep
 * working either way, so there is never anything to reset.
 *
 * Order tracking (/track) isn't a setting: it's always there.
 */
export const accountSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  passwords: z.boolean().default(false),
});
export type AccountSettings = z.infer<typeof accountSettingsSchema>;

/** Stored settings with defaults filled in; junk reads as "off". */
export function readAccountSettings(raw: unknown): AccountSettings {
  const r = accountSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : accountSettingsSchema.parse({});
}
