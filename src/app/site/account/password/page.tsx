import type { Metadata } from "next";
import { PasswordPage, accountMetadata } from "../../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Password");
}

export default function Password() {
  return <PasswordPage />;
}
