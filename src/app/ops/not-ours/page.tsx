import { requireUser } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { Shell } from "../../admin/shell";

export const dynamic = "force-dynamic";

/** Signed in, but not O/I support: this surface isn't for them. */
export default async function NotOurs() {
  const user = await requireUser();
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
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">This is output/input&apos;s own</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Operations is where we look after every site. {user.email} isn&apos;t one of ours — your site&apos;s admin is at the admin address you were sent.
      </p>
    </Shell>
  );
}
