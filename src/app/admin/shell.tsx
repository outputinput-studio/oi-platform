import { environmentName } from "@/lib/env";

/**
 * The frame around the signed-out screens (sign in, site picker): one
 * centred card that reads well on a phone. Signed-in pages use AdminShell.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] p-6">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark />
          <EnvBadge />
        </div>
        {children}
      </div>
    </main>
  );
}

export function Wordmark() {
  // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
  return <img src="/brand/wordmark-white.svg" alt="output/input" width={180} height={26} className="h-5 w-auto" />;
}

export function EnvBadge() {
  const envName = environmentName();
  if (envName === "production") return null;
  return <span className="text-xs text-[var(--muted)]">{envName}</span>;
}
