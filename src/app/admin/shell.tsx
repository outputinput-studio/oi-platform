import { environmentName } from "@/lib/env";

/**
 * The admin's frame for stage 2: one centred card that reads well on a
 * phone. The real navigation arrives with the admin shell stage.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const envName = environmentName();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] p-6">
        <div className="mb-8 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed */}
          <img src="/brand/wordmark-white.svg" alt="output/input" width={180} height={26} className="h-5 w-auto" />
          {envName !== "production" && <span className="text-xs text-[var(--muted)]">{envName}</span>}
        </div>
        {children}
      </div>
    </main>
  );
}
