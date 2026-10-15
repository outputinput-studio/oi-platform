import { requireSiteAccess } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { PageHeader } from "../../ui";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { site, role, user } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Settings" back="/" />
      <section className="mt-5 rounded-md border border-[var(--border)] p-4">
        <SettingsForm name={site.name} slug={site.slug} canEdit={role === "owner"} />
      </section>

      <section className="mt-6 rounded-md border border-[var(--border)] p-4">
        <h2 className="text-base font-medium">Your account</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
        <div className="mt-4 flex items-center gap-6 text-sm">
          <a href="/sites" className="text-[var(--muted)] underline-offset-4 hover:underline">
            Switch site
          </a>
          <form action={signOut}>
            <button type="submit" className="text-[var(--muted)] underline-offset-4 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
