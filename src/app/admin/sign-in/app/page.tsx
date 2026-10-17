import { requireHalfSignIn } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { Shell } from "../../shell";
import { AppCodeForm } from "./app-code-form";

export const dynamic = "force-dynamic";

/**
 * The second step for people who use an authenticator app (Stage 38): the
 * emailed code got them this far; the app's code, or a recovery code,
 * lets them in. Nothing else in the admin opens until then.
 */
export default async function AppCodePage() {
  const { user } = await requireHalfSignIn();
  return (
    <Shell
      footer={
        <form action={signOut}>
          Not {user.email}?{" "}
          <button type="submit" className="text-body underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      }
    >
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">One more code</h1>
      <p className="mb-7 mt-1.5 text-[13.5px] leading-relaxed text-muted">Open your authenticator app and type the six digits it shows for output/input.</p>
      <AppCodeForm />
    </Shell>
  );
}
