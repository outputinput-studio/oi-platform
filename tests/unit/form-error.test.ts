import { describe, expect, test } from "vitest";
import { z } from "zod";
import { FieldError, formError, named } from "@/lib/form-error";

describe("errors that point at fields", () => {
  const rows = z.array(z.object({ title: z.string().min(1, "Give the row a title."), text: z.string().max(3, "Too long.") }));

  test("every field at fault, as a dotted path, with the first problem in words", () => {
    const r = rows.safeParse([{ title: "Care", text: "ok" }, { title: "", text: "far too long" }]);
    expect(formError(r.error)).toEqual({ error: "Give the row a title.", fields: ["1.title", "1.text"] });
  });

  test("named() puts a single value under its field, so the error says which", () => {
    expect(() => named("slug", z.string().min(2, "Too short."), "a")).toThrow(z.ZodError);
    try {
      named("rows", rows, [{ title: "", text: "" }]);
    } catch (err) {
      expect(formError(err)).toEqual({ error: "Give the row a title.", fields: ["rows.0.title"] });
    }
    expect(named("n", z.coerce.number(), "4")).toBe(4);
  });

  test("a bare value's error takes the field the action names; refusals name their own", () => {
    const r = z.string().email("Not an email.").safeParse("nope");
    expect(formError(r.error, { field: "email" })).toEqual({ error: "Not an email.", fields: ["email"] });
    expect(formError(r.error)).toEqual({ error: "Not an email." });
    expect(formError(new FieldError("code", "There's already a code SAVE10."))).toEqual({ error: "There's already a code SAVE10.", fields: ["code"] });
  });

  test("anything else is just its message, or a plain apology", () => {
    expect(formError(new Error("The list changed under you."))).toEqual({ error: "The list changed under you." });
    expect(formError("boom")).toEqual({ error: "Something went wrong. Try again." });
  });
});
