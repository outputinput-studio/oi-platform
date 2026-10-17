import Link from "next/link";
import { signOut } from "@/modules/auth/actions";
import { environmentName } from "@/lib/env";
import { Wordmark } from "../admin/shell";

/** The frame around every ops screen: OPS, the sections, who's signed in. */
export function OpsShell({ email, children }: { email: string; children: React.ReactNode }) {
  const envName = environmentName();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-5 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Wordmark />
            <span className="label">Ops</span>
            {envName !== "production" && <span className="label !text-faint">{envName}</span>}
          </Link>
          <nav aria-label="Operations" className="flex gap-1">
            <Link href="/" className="rounded-[6px] px-3 py-1.5 text-[14px] text-body hover:bg-hover">
              Sites
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px] text-muted">
            <span className="hidden font-mono sm:inline">{email}</span>
            <form action={signOut}>
              <button type="submit" className="text-body underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-4 pb-16 md:px-6">{children}</main>
    </div>
  );
}
