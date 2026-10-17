import { redirect } from "next/navigation";

/** Sign-in hands on to /sites (the admin's site picker); in ops, the sites are Home. */
export default function OpsSites() {
  redirect("/");
}
