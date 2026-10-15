/**
 * Which front door a request came through, decided by hostname.
 *
 *   admin.<domain>  → the client admin
 *   ops.<domain>    → operations (output/input staff only)
 *   anything else   → a storefront, identified by its host
 *
 * One app, three surfaces. This is a pure function so it can be unit tested
 * without a server. It must never touch the database.
 */
export type Surface = "admin" | "ops" | "site";

export function resolveSurface(hostHeader: string | null | undefined): {
  surface: Surface;
  host: string;
} {
  const host = (hostHeader ?? "").toLowerCase().split(":")[0].trim();
  const label = host.split(".")[0];
  if (label === "admin") return { surface: "admin", host };
  if (label === "ops") return { surface: "ops", host };
  return { surface: "site", host };
}

/** Path prefix each surface's routes live under inside the app. */
export const SURFACE_PREFIX: Record<Surface, string> = {
  admin: "/admin",
  ops: "/ops",
  site: "/site",
};
