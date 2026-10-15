import { requireSiteAccess } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { Shell } from "./shell";

export const dynamic = "force-dynamic";

/**
 * The site's home. Stage 2 proves the lock: this page renders only for a
 * signed-in member of the chosen site. The real admin arrives next stage.
 */
export default async function AdminHome() {
  const { user, site, role } = await requireSiteAccess();
  return (
    <Shell>
      <h1 className="text-2xl font-semibold">{site.name}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {user.email} · <span data-testid="role">{role}</span>
      </p>
      <p className="mt-6 text-sm text-[var(--muted)]">Signed in. The admin itself is the next stage.</p>
      <div className="mt-8 flex items-center gap-6 text-sm">
        <a href="/sites" className="text-[var(--muted)] underline-offset-4 hover:underline">
          Switch site
        </a>
        <form action={signOut}>
          <button type="submit" className="text-[var(--muted)] underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </Shell>
  );
}
