import { environmentName } from "@/lib/env";
import { Wordmark } from "./(site)/nav";

/**
 * The frame around the signed-out screens (sign in, site picker), as in
 * design/admin.html: wordmark top left, the screen's words below, a quiet
 * footer. One column on a phone; on a laptop the same column, centred.
 */
export function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const envName = environmentName();
  return (
    <main className="flex min-h-screen flex-col px-5 pb-8 pt-14 md:items-center md:justify-center md:pt-8">
      <div className="flex w-full max-w-[360px] flex-1 flex-col md:flex-none">
        <div className="mb-10 flex items-center gap-3">
          <Wordmark className="h-[22px]" />
          {envName !== "production" && <span className="label !text-faint">{envName}</span>}
        </div>
        <div className="flex-1">{children}</div>
        {footer && <div className="mt-12 text-center text-[12.5px] leading-relaxed text-faint md:mt-10">{footer}</div>}
      </div>
    </main>
  );
}

export { Wordmark };
export function EnvBadge() {
  const envName = environmentName();
  if (envName === "production") return null;
  return <span className="label !text-faint">{envName}</span>;
}
