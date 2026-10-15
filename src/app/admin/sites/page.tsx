import { requireUser, sitesFor } from "@/modules/auth/access";
import { chooseSite, signOut } from "@/modules/auth/actions";
import { Shell } from "../shell";

export const dynamic = "force-dynamic";

/** Pick which site to work in. One site goes straight through. */
export default async function SitesPage() {
  const user = await requireUser();
  const mine = await sitesFor(user.id);

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-semibold">{mine.length ? "Your sites" : "No sites yet"}</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        {mine.length
          ? "Choose one to work in."
          : "Your account isn't on any site. Ask the site owner to add you, then sign in again."}
      </p>
      <ul className="space-y-2">
        {mine.map(({ site, role }) => (
          <li key={site.id}>
            <form action={chooseSite}>
              <input type="hidden" name="siteId" value={site.id} />
              <button
                type="submit"
                className="flex w-full items-center justify-between rounded-md border border-[var(--border)] px-4 py-3 text-left hover:border-[var(--accent)]"
              >
                <span className="text-base">{site.name}</span>
                <span className="text-sm text-[var(--muted)]">{role}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <form action={signOut} className="mt-8">
        <button type="submit" className="text-sm text-[var(--muted)] underline-offset-4 hover:underline">
          Sign out
        </button>
      </form>
    </Shell>
  );
}
