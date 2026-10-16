import { requireSiteAccess } from "@/modules/auth/access";
import { getMenu } from "@/modules/menus/server";
import { deleteMenuAction, resetHeaderAction } from "@/modules/menus/actions";
import { MenuEditor } from "./menu-editor";

export const dynamic = "force-dynamic";

export default async function EditMenuPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { user, site } = await requireSiteAccess();
  const { menu, targets } = await getMenu({ actorId: user.id, siteId: site.id, key });
  return (
    <MenuEditor
      menuKey={menu.key}
      kind={menu.kind}
      automatic={menu.automatic}
      initial={{ name: menu.name, items: menu.items }}
      targets={targets}
      deleteAction={deleteMenuAction}
      resetAction={resetHeaderAction}
    />
  );
}
