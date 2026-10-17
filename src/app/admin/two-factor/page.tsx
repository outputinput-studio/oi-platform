import { redirect } from "next/navigation";
import { requireSignIn } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { qrSvgPath } from "@/modules/auth/qr";
import { groupKey } from "@/modules/auth/totp";
import { requiredFor, startSetup } from "@/modules/auth/two-factor";
import { secretsAvailable } from "@/lib/secrets";
import { Shell } from "../shell";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

/** Where to go once it's on: a path on this admin, nothing else. */
function nextPath(raw: string | string[] | undefined): string {
  const p = typeof raw === "string" ? raw : "";
  return /^\/(?!\/)[\w\-/]*$/.test(p) ? p : "/";
}

/**
 * Setting up the authenticator app (Stage 38). Owners land here before
 * anything else until it's on (Carl: "Required for Owners"); anyone else
 * comes from Your account. Scan the code (or type the key), type the six
 * digits the app shows, then keep the ten recovery codes.
 */
export default async function TwoFactorSetupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { user, twoFactorOn } = await requireSignIn();
  const next = nextPath((await searchParams).next);
  if (twoFactorOn) redirect(next);
  const footer = (
    <form action={signOut}>
      <button type="submit" className="text-body underline-offset-4 hover:underline">
        Sign out
      </button>
    </form>
  );

  if (!secretsAvailable()) {
    return (
      <Shell footer={footer}>
        <h1 className="text-[26px] font-semibold tracking-[-0.5px]">Not quite ready</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">This server can&apos;t keep an authenticator key safely yet. We&apos;re on it; try again soon.</p>
      </Shell>
    );
  }

  const [required, { secret, uri }] = await Promise.all([requiredFor(user.id), startSetup(user.id)]);
  const qr = qrSvgPath(uri);
  return (
    <Shell footer={footer}>
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">{required ? "Owners use an authenticator app" : "Set up your authenticator app"}</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        {required
          ? "This login can move money, so it's worth the extra step. Set it up once; after that, signing in asks for the code from your app as well as the emailed one."
          : "After the emailed code, signing in will ask for the six digits your app shows. Worth it if this login matters to you."}
      </p>

      <ol className="mt-7 space-y-6">
        <li>
          <p className="label">1 · Open an authenticator app</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-body">Google Authenticator, Microsoft Authenticator, 1Password or similar, on your phone.</p>
        </li>
        <li>
          <p className="label">2 · Scan this code</p>
          <div className="mt-3 w-[196px] rounded-card bg-text p-2 text-sunken">
            <svg data-testid="two-factor-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} className="block h-auto w-full" shapeRendering="crispEdges" role="img" aria-label="QR code for your authenticator app">
              <path d={qr.d} fill="currentColor" />
            </svg>
          </div>
          <p className="mt-3 text-[13px] text-muted">Can&apos;t scan it? Type this key into the app instead:</p>
          <p data-testid="two-factor-key" className="mt-1.5 select-all font-mono text-[14px] tracking-[1px] text-text">
            {groupKey(secret)
              .split(" ")
              .map((g, i) => (
                <span key={i} className="mr-[0.6em] inline-block">
                  {g}
                </span>
              ))}
          </p>
          <a href={uri} className="mt-3 inline-block text-[13.5px] text-accent-text underline-offset-4 hover:underline md:hidden">
            On this phone? Open it in my app
          </a>
        </li>
        <li>
          <p className="label">3 · Type the six digits it shows</p>
          <SetupForm next={next} />
        </li>
      </ol>
    </Shell>
  );
}
