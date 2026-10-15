import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/access";
import { Shell } from "../shell";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await currentUser()) redirect("/sites");
  return (
    <Shell>
      <h1 className="mb-4 text-2xl font-semibold">Sign in</h1>
      <SignInForm />
    </Shell>
  );
}
