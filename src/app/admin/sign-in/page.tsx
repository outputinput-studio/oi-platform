import { redirect } from "next/navigation";
import { currentUser } from "@/modules/auth/access";
import { Shell } from "../shell";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ email?: string; joined?: string }> }) {
  if (await currentUser()) redirect("/sites");
  const q = await searchParams;
  const email = typeof q.email === "string" && q.email.length <= 254 ? q.email : "";
  return (
    <Shell footer={<>O/I is invite-only. If you need access, ask the person who runs your site.</>}>
      <h1 className="text-[26px] font-semibold tracking-[-0.5px]">Sign in</h1>
      <p className="mb-7 mt-1.5 text-[13.5px] text-muted">
        {q.joined ? "You're on the team. Now a six-digit code, emailed to you — no password to remember." : "A six-digit code, emailed to you. No password to remember."}
      </p>
      <SignInForm email={email} />
    </Shell>
  );
}
