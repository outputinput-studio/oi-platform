import type { OrderStatus } from "@/db/schema";
import { STATUS_LABEL } from "@/modules/orders/admin";
import { Pill } from "../../ui";

/** New stands out; the rest read quietly. */
export function StatusPill({ status, refunded, partly }: { status: OrderStatus; refunded?: boolean; partly?: boolean }) {
  if (refunded) return <Pill tone="alert">Refunded</Pill>;
  if (partly) return <Pill tone="alert">Part refunded</Pill>;
  return <Pill tone={status === "new" ? "warning" : status === "done" ? "neutral" : "success"}>{STATUS_LABEL[status]}</Pill>;
}
