"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveOrderAction, refundOrderAction } from "@/modules/orders/actions";
import { parsePrice, type Currency } from "@/modules/sites/shop";
import type { Template } from "@/modules/sites/messages";
import { draftFrom, trackingText } from "@/modules/orders/emails";
import type { OrderStatus } from "@/db/schema";
import { Button, Field, Input, Notice, Sheet, Switch, Textarea } from "../../../ui";

const TITLE: Record<OrderStatus, string> = { new: "", inProgress: "Making it", sent: "On its way", done: "All done" };

/**
 * The button that moves an order to its next stage. It opens a sheet with
 * the email the customer will get, drafted from Settings · Customer emails
 * (edit it, or don't send one), and for "sent" the carrier and tracking
 * number — both optional.
 */
export function MoveOrder({
  orderId,
  next,
  label,
  template,
  vars,
  tracking,
}: {
  orderId: string;
  next: OrderStatus;
  /** The button: "Mark as in progress", in the team's own stage names (Settings · Order statuses). */
  label: string;
  /** The site's wording for this stage, with {fill-ins}. */
  template: Template;
  vars: Record<string, string>;
  tracking: { carrier: string; number: string };
}) {
  const router = useRouter();
  const draft = (tr: { carrier: string; number: string }) => draftFrom(template, { ...vars, tracking: trackingText(tr) });
  const [open, setOpen] = useState(false);
  const [send, setSend] = useState(next !== "done");
  const [subject, setSubject] = useState(() => draft(tracking).subject);
  const [message, setMessage] = useState(() => draft(tracking).message);
  const [t, setT] = useState(tracking);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Typing a tracking number puts it into the email (until the message has been edited by hand).
  const [edited, setEdited] = useState(false);
  const updateTracking = (nt: { carrier: string; number: string }) => {
    setT(nt);
    if (!edited && next === "sent") setMessage(draft(nt).message);
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
        {label}
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
              {pending ? "Saving…" : send ? `${label} and email them` : label}
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

/**
 * "Refund this order": all of what's left, or part of it. The money goes
 * back through the business's own Stripe first; the order only changes
 * once Stripe has said yes.
 */
export function RefundOrder({ orderId, left, leftLabel, full, draft, currency }: { orderId: string; left: string; leftLabel: string; full: boolean; draft: { subject: string; message: string }; currency: Currency }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(left);
  const [restock, setRestock] = useState(full);
  const [send, setSend] = useState(true);
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState(draft.message);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      setError("");
      let cents: number | null;
      try {
        cents = parsePrice(amount);
      } catch (e) {
        return setError(e instanceof Error ? e.message : "That isn't an amount.");
      }
      const r = await refundOrderAction(orderId, { amount: cents, restock, ...(send ? { email: { subject, message } } : {}) });
      if (r.error) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button
        type="button"
        variant="danger"
        className="w-full"
        onClick={() => {
          // Fresh each time: after a part refund, what's left (and the email about it) has changed.
          setAmount(left);
          setRestock(full);
          setSubject(draft.subject);
          setMessage(draft.message);
          setError("");
          setOpen(true);
        }}
      >
        Refund this order
      </Button>
      {open && (
        <Sheet title="Refund" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <Field label="Amount" htmlFor="refund-amount" hint={`Up to ${leftLabel} (${currency}). It goes back to the card they paid with.`}>
              <Input id="refund-amount" inputMode="decimal" className="max-w-[180px] font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <div className="space-y-4 rounded-card border border-line bg-surface p-4">
              <Switch checked={restock} onChange={setRestock} label="Put the stock back" hint="Ready-to-ship products go back into stock; a one-off goes back on sale." />
              <Switch checked={send} onChange={setSend} label="Email the customer" hint="So they know it's on its way back." />
            </div>
            {send && (
              <>
                <Field label="Subject" htmlFor="refund-subject">
                  <Input id="refund-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
                </Field>
                <Field label="Message" htmlFor="refund-message">
                  <Textarea id="refund-message" value={message} rows={6} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
                </Field>
              </>
            )}
            <Notice error={error} />
            <Button type="button" variant="danger" className="w-full" disabled={pending} onClick={confirm}>
              {pending ? "Refunding…" : "Refund it"}
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
