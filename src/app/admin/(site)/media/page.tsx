import { requireSiteAccess } from "@/modules/auth/access";
import { listMedia, mediaAvailable } from "@/modules/media/server";
import { MediaLibrary } from "./media-library";

export const dynamic = "force-dynamic";

/** The site's pictures. Upload from a phone, describe each one, remove what's not needed. */
export default async function MediaPage() {
  const { user, site } = await requireSiteAccess();
  const items = await listMedia({ actorId: user.id, siteId: site.id });
  return (
    <>
      <h1 className="text-2xl font-semibold">Pictures</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {items.length === 0 ? "Nothing here yet." : `${items.length} picture${items.length === 1 ? "" : "s"}.`} Big photos are shrunk on your phone
        before they&apos;re sent.
      </p>
      <div className="mt-6">
        <MediaLibrary initial={items} mode="manage" available={mediaAvailable()} />
      </div>
    </>
  );
}
