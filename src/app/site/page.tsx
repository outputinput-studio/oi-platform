import { Storefront } from "./storefront";
import { HOME_SLUG } from "@/modules/pages/server";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Storefront slug={HOME_SLUG} />;
}
