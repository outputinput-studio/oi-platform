import { redirect } from "next/navigation";

/** Theme grew into Branding (logo, favicon, colours). Old links land there. */
export default function ThemePage() {
  redirect("/settings/branding");
}
