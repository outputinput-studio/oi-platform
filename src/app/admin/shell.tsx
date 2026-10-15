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
        <p className="mb-6 text-sm text-[var(--muted)]">
          output/input{envName !== "production" && <span> · {envName}</span>}
        </p>
        {children}
      </div>
    </main>
  );
}
