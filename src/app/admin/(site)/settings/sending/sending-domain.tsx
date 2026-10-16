"use client";

import { useActionState, useState, useTransition } from "react";
import { checkSendingDomainAction, removeSendingDomainAction, setUpSendingDomainAction, type DomainFormState } from "@/modules/sites/domain-actions";
import type { SendDomainView } from "@/modules/sites/sending-domain";
import { Button, Card, Field, Input, Label, Notice, Pill } from "../../../ui";

const STATUS: Record<string, { tone: "success" | "warning" | "alert" | "neutral"; text: string }> = {
  verified: { tone: "success", text: "Sending from it" },
  pending: { tone: "warning", text: "Checking the records" },
  not_started: { tone: "warning", text: "Waiting for the records" },
  temporary_failure: { tone: "warning", text: "Checking again" },
  failed: { tone: "alert", text: "Records not found" },
};

/**
 * Sending from your own domain: emails to customers come from
 * orders@yourdomain instead of output/input's address, once the records
 * Resend gives are in the domain's DNS.
 */
export function SendingDomainCard({ view, suggested, canEdit }: { view: SendDomainView; suggested: string; canEdit: boolean }) {
  const [state, act, pending] = useActionState(setUpSendingDomainAction, {} as DomainFormState);
  const [result, setResult] = useState<DomainFormState>({});
  const [busy, start] = useTransition();
  const own = view.setUp;
  return (
    <section data-testid="sending-domain">
      <Label>Your own sending domain</Label>
      {!own ? (
        !view.available ? (
          <Card variant="static" className="px-4 py-3.5">
            <p className="text-[14px] text-text">Not available yet</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">Sending from your own domain needs email switched on for the whole platform first. output/input is on it; this turns on by itself when it&apos;s done.</p>
          </Card>
        ) : (
          <form action={act} className="space-y-3">
            <p className="text-[13px] leading-[1.5] text-body">Emails to customers come from your own address, like orders@{suggested || "yourdomain.com.au"}, and are less likely to land in junk. You&apos;ll add three records to the domain&apos;s DNS.</p>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <Field label="Address" htmlFor="sd-local">
                <Input id="sd-local" name="local" defaultValue="orders" maxLength={41} readOnly={!canEdit} className="font-mono" />
              </Field>
              <Field label="@ domain" htmlFor="sd-domain">
                <Input id="sd-domain" name="domain" defaultValue={suggested} placeholder="kinikouture.com.au" autoCapitalize="none" spellCheck={false} readOnly={!canEdit} className="font-mono" />
              </Field>
            </div>
            <Notice error={state.error} fields={state.fields} />
            {canEdit && (
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? "Setting up…" : "Set it up"}
              </Button>
            )}
          </form>
        )
      ) : (
        <Card className="divide-y divide-line-soft">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <p className="min-w-0 flex-1 break-all font-mono text-[14px] text-text">
              {own.local}@{own.name}
            </p>
            <span data-testid="sending-domain-state">
              <Pill tone={(STATUS[own.status] ?? STATUS.pending).tone}>{(STATUS[own.status] ?? STATUS.pending).text}</Pill>
            </span>
          </div>
          {own.status !== "verified" && (
            <p className="px-4 py-3.5 text-[13px] leading-[1.5] text-body">Add these to {own.name}&apos;s DNS, where you bought the domain. Until they&apos;re found, emails keep coming from output/input&apos;s address — nothing breaks in the meantime.</p>
          )}
          {own.records.map((r, i) => (
            <div key={i} className="px-4 py-3.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 font-mono text-[12.5px] text-muted">
                  {r.type} · {r.name}
                  {typeof r.priority === "number" ? ` · priority ${r.priority}` : ""}
                </p>
                <Pill tone={r.status === "verified" ? "success" : r.status === "failed" ? "alert" : "warning"}>{r.status === "verified" ? "Found" : r.status === "failed" ? "Not found" : "Waiting"}</Pill>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <p className="min-w-0 flex-1 break-all font-mono text-[13px] text-text">{r.value}</p>
                <Copy text={r.value} />
              </div>
            </div>
          ))}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
              {own.status !== "verified" && (
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => start(async () => setResult(await checkSendingDomainAction()))}>
                  Check now
                </Button>
              )}
              <Button type="button" variant="quiet" size="sm" disabled={busy} onClick={() => start(async () => setResult(await removeSendingDomainAction()))}>
                Stop sending from it
              </Button>
              <Notice error={result.error} />
            </div>
          )}
        </Card>
      )}
    </section>
  );
}

function Copy({ text }: { text: string }) {
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
      className="h-9 flex-none rounded-button border border-line px-3 text-[13px] text-text hover:bg-hover"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
