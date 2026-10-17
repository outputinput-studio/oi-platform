import { z } from "zod";

/**
 * Settings · Custom code (owners only, Carl, Oct 2026): code added at the
 * start and the end of every storefront page. Every save keeps the one
 * before it, ten back, so a change that breaks the site can be put back.
 * Pure: the module stores it, the storefront renders it.
 */

export const MAX_CODE = 20_000;
export const KEEP_VERSIONS = 10;

export const customCodeSchema = z.object({
  head: z.string().max(MAX_CODE, `Keep it under ${MAX_CODE.toLocaleString("en-AU")} characters.`).default(""),
  body: z.string().max(MAX_CODE, `Keep it under ${MAX_CODE.toLocaleString("en-AU")} characters.`).default(""),
});

export type CodeVersion = { head: string; body: string; at: string; by: string };
export type CustomCode = CodeVersion & { history: CodeVersion[] };

const versionSchema = z.object({ head: z.string().default(""), body: z.string().default(""), at: z.string().default(""), by: z.string().default("") });
const storedSchema = versionSchema.extend({ history: z.array(versionSchema).default([]) });

export function readCustomCode(raw: unknown): CustomCode {
  const r = storedSchema.safeParse(raw ?? {});
  return r.success ? r.data : { head: "", body: "", at: "", by: "", history: [] };
}

/** A save: the new code is current, and what was there (if anything) goes to the top of the history. The same code again changes nothing. */
export function withSave(c: CustomCode, code: { head: string; body: string }, meta: { at: string; by: string }): CustomCode {
  if (code.head === c.head && code.body === c.body) return c;
  const before: CodeVersion[] = c.head || c.body ? [{ head: c.head, body: c.body, at: c.at, by: c.by }] : [];
  return { head: code.head, body: code.body, at: meta.at, by: meta.by, history: [...before, ...c.history].slice(0, KEEP_VERSIONS) };
}

/** Put an earlier version back (by when it was saved). What's current now is kept in the history too. */
export function withRevert(c: CustomCode, versionAt: string, meta: { at: string; by: string }): CustomCode {
  const v = c.history.find((h) => h.at === versionAt);
  if (!v) throw new Error("That version isn't there any more. Reload and try again.");
  return withSave(c, { head: v.head, body: v.body }, meta);
}
