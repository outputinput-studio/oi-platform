import { requireUser, sitesFor } from "@/modules/auth/access";
import { chooseSite, signOut } from "@/modules/auth/actions";
import { Shell } from "../shell";
import { Chevron, Rows } from "../ui";

export const dynamic = "force-dynamic";

/** Pick which site to work in. One site goes straight through. */
export default async function SitesPage() {
  const user = await requireUser();
  const mine = await sitesFor(user.id);

  return (
    <Shell
      footer={
        <form action={signOut}>
          <button type="submit" className="text-body underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      }
    >
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">{mine.length ? "Your sites" : "No sites yet"}</h1>
      <p className="mb-7 mt-1.5 text-[13.5px] text-muted">
        {mine.length ? "Choose one to work in." : "Your account isn't on any site. Ask the site owner to add you, then sign in again."}
      </p>
      {mine.length > 0 && (
        <Rows>
          {mine.map(({ site, role }) => (
            <form key={site.id} action={chooseSite}>
              <input type="hidden" name="siteId" value={site.id} />
              <button type="submit" className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-hover first:rounded-t-card last:rounded-b-card">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{site.name}</span>
                  <span className="mt-0.5 block text-[13px] capitalize text-muted">{role}</span>
                </span>
                <Chevron />
              </button>
            </form>
          ))}
        </Rows>
      )}
    </Shell>
  );
}
