import { requireSiteAccess } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { countSessions, listSessions } from "@/modules/auth/sessions";
import { twoFactorStatus } from "@/modules/auth/two-factor";
import { secretsAvailable } from "@/lib/secrets";
import { Button, Field, Input, Label, PageHeader, Row, Rows } from "../../ui";
import { NameForm, SessionRow, SignOutOthers, TwoFactorCard } from "./account-forms";

export const dynamic = "force-dynamic";

/**
 * Your account, as in design/admin.html: your name, how you sign in (the
 * emailed code, plus an authenticator app — required for Owners), where
 * you're signed in, and signing out. Everything here is about you, on
 * every site you belong to.
 */
export default async function AccountPage() {
  const { user, sessionId } = await requireSiteAccess();
  const [tf, signedIn, total] = await Promise.all([twoFactorStatus(user.id), listSessions(user.id, sessionId), countSessions(user.id)]);
  const others = total - 1;
  const notShown = total - signedIn.length;
  return (
    <>
      <PageHeader title="Your account" back="/" />
      <div className="max-w-[640px] space-y-8 pt-5 md:pt-7">
        <section>
          <Label>You</Label>
          <div className="space-y-4">
            <NameForm name={user.name} />
            <Field label="Email address" htmlFor="acc-email" hint="Ask us to change this for now; changing it yourself arrives soon.">
              <Input id="acc-email" value={user.email} readOnly className="font-mono" />
            </Field>
          </div>
        </section>

        <section>
          <Label>Signing in</Label>
          <Rows variant="static">
            <Row title="A code by email" detail="Every time you sign in. Signing in lasts 30 days, and renews whenever you use it." />
          </Rows>
          <TwoFactorCard on={tf.on} required={tf.required} recoveryLeft={tf.recoveryLeft} available={secretsAvailable()} />
        </section>

        <section>
          <Label right={total <= 1 ? "Just here" : `${total} places`}>Where you&apos;re signed in</Label>
          <Rows variant="static">
            {signedIn.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </Rows>
          {notShown > 0 && (
            <p className="mt-2.5 text-[13px] text-muted">
              And {notShown} more, used less recently. Sign out everywhere else to clear them all.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
            <a href="/sites" className="text-[14px] text-body underline-offset-4 hover:underline">
              Switch site
            </a>
          </div>
          {others > 0 && <SignOutOthers />}
        </section>
      </div>
    </>
  );
}
