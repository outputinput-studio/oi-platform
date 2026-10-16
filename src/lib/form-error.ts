import { z } from "zod";

/**
 * Errors that point at fields. When someone gets something wrong, the
 * form says what, outlines every field at fault, and scrolls to the top
 * one (Carl, Oct 2026). Actions return `formError(err)`; its `fields` are
 * dotted paths ("taxRate", "zones.0.rates.1.price") matching the `name` or
 * `data-field` of the controls on screen. `showFieldErrors` does the rest.
 */
export type FormError = { error: string; fields?: string[] };

/** A refusal about one field that isn't a schema problem: "That web address is taken." */
export class FieldError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/** Parse one value under a name, so a problem with it names its field: `named("slug", slugSchema, p.slug)`. */
export function named<T extends z.ZodType>(name: string, schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  throw new z.ZodError(r.error.issues.map((i) => ({ ...i, path: [name, ...i.path] })));
}

/**
 * What a form shows for an error: the first problem in words, and every
 * field at fault. `field` names the field when the action only sent one
 * value, so a bare schema error still points somewhere.
 */
export function formError(err: unknown, opts: { field?: string; fallback?: string } = {}): FormError {
  if (err instanceof z.ZodError) {
    const fields = [...new Set(err.issues.map((i) => i.path.map(String).join(".") || opts.field || ""))].filter(Boolean);
    return { error: err.issues[0]?.message ?? opts.fallback ?? "That doesn't look right.", ...(fields.length ? { fields } : {}) };
  }
  if (err instanceof FieldError) return { error: err.message, fields: [err.field] };
  return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
}

/**
 * In the browser: outline the fields at fault and bring the top one into
 * view, focused. Looks inside `scope` for `[name]` or `[data-field]`; a
 * path with no control of its own falls back to the nearest one that has
 * ("zones.0.rates" → "zones.0"). Outlines clear as the field is changed.
 * Returns a function that clears them.
 */
export function showFieldErrors(scope: ParentNode, fields: string[]): () => void {
  const found = new Set<HTMLElement>();
  for (const f of fields) {
    for (let path = f; path; path = path.includes(".") ? path.slice(0, path.lastIndexOf(".")) : "") {
      const q = CSS.escape(path);
      const els = [...scope.querySelectorAll<HTMLElement>(`[name="${q}"], [data-field="${q}"]`)];
      if (els.length) {
        els.forEach((el) => found.add(el));
        break;
      }
    }
  }
  const marked = [...found].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const clear = (el: HTMLElement) => () => el.removeAttribute("aria-invalid");
  for (const el of marked) {
    el.setAttribute("aria-invalid", "true");
    el.addEventListener("input", clear(el), { once: true });
    el.addEventListener("change", clear(el), { once: true });
  }
  // The top one on screen (a hidden input carrying a value has nowhere to scroll to).
  const top = marked.find((el) => el.getClientRects().length > 0);
  if (top) {
    // Scroll only if it's out of sight (clear of the header, the save bar and the phone's bottom navigation).
    const r = top.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight - 160) top.scrollIntoView({ block: "center", behavior: "smooth" });
    // A control takes the cursor, unless the cursor is already in a field at fault (typing, with autosave).
    // A group (a card, a list) is only brought into view.
    const typingInOne = marked.some((el) => el === document.activeElement || el.contains(document.activeElement));
    if (!typingInOne && top.matches("input, textarea, select, button, [tabindex]")) top.focus({ preventScroll: true });
  }
  return () => marked.forEach((el) => el.removeAttribute("aria-invalid"));
}
