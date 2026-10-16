import type { Metadata } from "next";
import { OrderPage, accountMetadata } from "../../../account";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return accountMetadata(`Order ${(await params).number.slice(0, 12)}`);
}

export default async function Order({ params }: Props) {
  return <OrderPage number={(await params).number} />;
}
