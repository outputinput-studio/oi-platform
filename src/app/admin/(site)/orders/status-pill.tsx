import type { OrderStatus } from "@/db/schema";
import { STATUS_LABEL } from "@/modules/orders/admin";
import { Pill } from "../../ui";

/** New stands out; the rest read quietly. */
export function StatusPill({ status, refunded }: { status: OrderStatus; refunded?: boolean }) {
  if (refunded) return <Pill tone="alert">Refunded</Pill>;
  return <Pill tone={status === "new" ? "warning" : status === "done" ? "neutral" : "success"}>{STATUS_LABEL[status]}</Pill>;
}
