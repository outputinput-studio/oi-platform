import { requireSiteAccess } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { Button, Field, Input, Label, PageHeader, Row, Rows } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * Your account: who you are and how you sign in. Editing the name and
 * seeing where you're signed in arrive in a later stage.
 */
export default async function AccountPage() {
  const { user } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Your account" back="/" />
      <div className="space-y-8 pt-5 md:pt-7">
        <section>
          <Label>You</Label>
          <div className="space-y-4">
            <Field label="Name" htmlFor="acc-name">
              <Input id="acc-name" value={user.name} readOnly />
            </Field>
            <Field label="Email address" htmlFor="acc-email" hint="Ask us to change this for now; changing it yourself arrives soon.">
              <Input id="acc-email" value={user.email} readOnly />
            </Field>
          </div>
        </section>
        <section>
          <Label>Signing in</Label>
          <Rows variant="static">
            <Row title="A code each time" detail="We email you a six-digit code when you sign in. Signing in lasts 30 days, and renews whenever you use it." />
          </Rows>
        </section>
        <section className="flex items-center gap-4">
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
          <a href="/sites" className="text-[14px] text-body underline-offset-4 hover:underline">
            Switch site
          </a>
        </section>
      </div>
    </>
  );
}
