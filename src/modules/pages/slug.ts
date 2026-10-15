/** Turn a title into an address: "About Us!" → "about-us". Pure, shared by server and browser. */
export function slugFromTitle(title: string): string {
  const s = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "page";
}
