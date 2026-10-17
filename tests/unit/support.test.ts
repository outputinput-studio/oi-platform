/**
 * O/I support access (Carl, Oct 2026): the addresses that can look after
 * every site come from one environment variable, read strictly.
 */
import { describe, expect, test } from "vitest";
import { parseSupportEmails } from "@/modules/auth/support-list";

describe("support addresses", () => {
  test("comma or space separated, lower case, duplicates once", () => {
    expect(parseSupportEmails(" Help@OutputInput.co, carl@outputinput.co  help@outputinput.co ")).toEqual(["help@outputinput.co", "carl@outputinput.co"]);
  });
  test("nothing set is nobody", () => {
    expect(parseSupportEmails(undefined)).toEqual([]);
    expect(parseSupportEmails("")).toEqual([]);
  });
  test("anything that isn't an address is refused outright, not skipped", () => {
    expect(() => parseSupportEmails("help@outputinput.co, *@outputinput.co")).toThrow(/isn't an email address/);
  });
});
