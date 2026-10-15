import { headers } from "next/headers";
import { environmentName } from "@/lib/env";
import type { Surface } from "@/lib/surface";

/**
 * Stage 1 placeholder. Names the surface and the environment so we can
 * confirm routing on every address before any real screen exists.
 */
export async function Placeholder({ surface }: { surface: Surface }) {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const envName = environmentName();
  const title = `${surface} · ${envName}`;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] p-6">
        <p className="mb-6 text-sm text-[var(--muted)]">output/input</p>
        <h1 className="text-2xl font-semibold" data-surface={surface} data-env={envName}>
          {title}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{host}</p>
      </div>
    </main>
  );
}
