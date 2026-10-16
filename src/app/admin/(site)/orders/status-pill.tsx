import type { OrderStatus } from "@/db/schema";
import { Pill } from "../../ui";

/** New stands out; the rest read quietly. `label` is the stage's name from Settings · Order statuses. */
export function StatusPill({ status, label, refunded, partly }: { status: OrderStatus; label: string; refunded?: boolean; partly?: boolean }) {
  if (refunded) return <Pill tone="alert">Refunded</Pill>;
  if (partly) return <Pill tone="alert">Part refunded</Pill>;
  return <Pill tone={status === "new" ? "warning" : status === "done" ? "neutral" : "success"}>{label}</Pill>;
}
