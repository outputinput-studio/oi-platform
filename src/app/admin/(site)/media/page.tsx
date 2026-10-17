import { requireSiteAccess } from "@/modules/auth/access";
import { listMedia, mediaAvailable, STORAGE_LIMIT_BYTES } from "@/modules/media/server";
import { MediaLibrary } from "./media-library";

export const dynamic = "force-dynamic";

/** The site's images, as in design/admin.html: storage bar, then the grid. Upload from the header. */
export default async function MediaPage() {
  const { user, site } = await requireSiteAccess("manager");
  const items = await listMedia({ actorId: user.id, siteId: site.id });
  const used = items.reduce((n, m) => n + m.sizeBytes, 0);
  return <MediaLibrary initial={items} mode="manage" available={mediaAvailable()} storage={{ used, limit: STORAGE_LIMIT_BYTES }} />;
}
