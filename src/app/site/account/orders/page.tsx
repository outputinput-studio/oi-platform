import type { Metadata } from "next";
import { OrdersPage, accountMetadata } from "../../account";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return accountMetadata("Your orders");
}

export default function Orders() {
  return <OrdersPage />;
}
