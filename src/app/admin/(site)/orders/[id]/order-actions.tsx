"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveOrderAction } from "@/modules/orders/actions";
import type { OrderStatus } from "@/db/schema";
import { Button, Field, Input, Notice, Sheet, Switch, Textarea } from "../../../ui";

const BUTTON: Record<OrderStatus, string> = { new: "", inProgress: "Mark as in progress", sent: "Mark as sent", done: "Mark as done" };
const TITLE: Record<OrderStatus, string> = { new: "", inProgress: "Making it", sent: "On its way", done: "All done" };

/**
 * The button that moves an order to its next stage. It opens a sheet with
 * the email the customer will get (edit it, or don't send one), and for
 * "sent" the carrier and tracking number — both optional.
 */
export function MoveOrder({
  orderId,
  next,
  draft,
  tracking,
  siteName,
  order,
}: {
  orderId: string;
  next: OrderStatus;
  draft: { subject: string; message: string };
  tracking: { carrier: string; number: string };
  siteName: string;
  order: { name: string; number: number; items: string[] };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [send, setSend] = useState(next !== "done");
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [t, setT] = useState(tracking);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Typing a tracking number puts it into the email (until the message has been edited by hand).
  const [edited, setEdited] = useState(false);
  const updateTracking = (nt: { carrier: string; number: string }) => {
    setT(nt);
    if (!edited && next === "sent") {
      const first = order.name.split(" ")[0];
      const what = order.items.length === 1 ? order.items[0] : `order ${order.number}`;
      const line = nt.number ? `\n\n${nt.carrier ? `${nt.carrier} tracking` : "Tracking"}: ${nt.number}` : "";
      setMessage(`Hi ${first},\n\nYour ${what} went out today.${line}\n\n${siteName}`);
    }
  };

  const confirm = () =>
    start(async () => {
      setError("");
      const r = await moveOrderAction(orderId, { status: next, ...(next === "sent" ? { tracking: t } : {}), ...(send ? { email: { subject, message } } : {}) });
      if (r.error) return setError(r.error);
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button type="button" className="w-full" onClick={() => setOpen(true)}>
        {BUTTON[next]}
      </Button>
      {open && (
        <Sheet title={TITLE[next]} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {next === "sent" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Carrier" htmlFor="m-carrier">
                    <Input id="m-carrier" value={t.carrier} maxLength={60} placeholder="Australia Post" onChange={(e) => updateTracking({ ...t, carrier: e.target.value })} />
                  </Field>
                  <Field label="Tracking number" htmlFor="m-number">
                    <Input id="m-number" value={t.number} maxLength={80} className="font-mono" onChange={(e) => updateTracking({ ...t, number: e.target.value })} />
                  </Field>
                </div>
                <p className="-mt-2 text-[12.5px] text-muted">Both are optional. Where the carrier is known, the order shows a tracking link.</p>
              </>
            )}
            <div className="rounded-card border border-line bg-surface p-4">
              <Switch checked={send} onChange={setSend} label="Email the customer" hint="They hear from you as it moves along." />
            </div>
            {send && (
              <>
                <Field label="Subject" htmlFor="m-subject">
                  <Input id="m-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label="Message" htmlFor="m-message">
                  <Textarea
                    id="m-message"
                    value={message}
                    rows={8}
                    maxLength={5000}
                    onChange={(e) => {
                      setEdited(true);
                      setMessage(e.target.value);
                    }}
                  />
                </Field>
              </>
            )}
            <Notice error={error} />
            <Button type="button" className="w-full" disabled={pending} onClick={confirm}>
              {pending ? "Saving…" : send ? `${BUTTON[next]} and email them` : BUTTON[next]}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}

export function CopyAddress({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="mt-3 rounded-button border border-line px-3.5 py-2 text-[13.5px] hover:bg-hover"
    >
      {done ? "Copied" : "Copy address"}
    </button>
  );
}
