import { requireSiteAccess } from "@/modules/auth/access";
import { listMedia, mediaAvailable } from "@/modules/media/server";
import { PageHeader } from "../../ui";
import { MediaLibrary } from "./media-library";

export const dynamic = "force-dynamic";

/** The site's images. Upload from a phone, describe each one, remove what's not needed. */
export default async function MediaPage() {
  const { user, site } = await requireSiteAccess();
  const items = await listMedia({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Images" back="/" />
      <p className="mt-5 text-sm text-[var(--muted)]">
        {items.length === 0 ? "Nothing here yet." : `${items.length} image${items.length === 1 ? "" : "s"}.`} Big photos are shrunk on your phone
        before they&apos;re sent.
      </p>
      <div className="mt-6">
        <MediaLibrary initial={items} mode="manage" available={mediaAvailable()} />
      </div>
    </>
  );
}
