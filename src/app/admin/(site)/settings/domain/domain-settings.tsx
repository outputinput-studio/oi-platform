"use client";

import { useActionState, useState, useTransition } from "react";
import { checkDomainAction, connectDomainAction, disconnectDomainAction, hideSiteAction, launchSiteAction, setDomainWwwAction, type DomainFormState } from "@/modules/sites/domain-actions";
import type { DomainView } from "@/modules/sites/domain";
import { Button, Card, Field, Input, Label, Notice, Pill } from "../../../ui";

/**
 * Settings · Domain, as in design/admin.html: the address the site has now
 * (it keeps working), the client's own domain with the two records it
 * needs and whether each is there yet, security, with or without www, and
 * Going live.
 */
export function DomainSettings({ status, slugHost, address, previewUrl, canEdit }: { status: DomainView; slugHost: string; address: string; previewUrl: string; canEdit: boolean }) {
  return (
    <div className="space-y-7">
      <section>
        <Label>Where your site lives now</Label>
        <Card className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <p data-testid="slug-host" className="min-w-0 flex-1 break-all font-mono text-[14px] text-text">
              {slugHost}
            </p>
            <Copy text={slugHost} />
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">This one works straight away and keeps working. Your own domain takes over once it is connected.</p>
        </Card>
      </section>

      {status.domain ? <Connected status={status} canEdit={canEdit} /> : <Connect canEdit={canEdit} />}

      <GoingLive launchedAt={status.launchedAt} address={address} previewUrl={previewUrl} canEdit={canEdit} />
    </div>
  );
}

function Connect({ canEdit }: { canEdit: boolean }) {
  const [state, act, pending] = useActionState(connectDomainAction, {} as DomainFormState);
  return (
    <section>
      <Label>Your own domain</Label>
      <form action={act} className="space-y-3">
        <Field label="Domain" htmlFor="d-domain" hint="The one you bought, like kinikouture.com.au. No domain yet? Any registrar sells them — Crazy Domains, VentraIP, Namecheap.">
          <Input id="d-domain" name="domain" placeholder="kinikouture.com.au" autoComplete="off" autoCapitalize="none" spellCheck={false} readOnly={!canEdit} className="font-mono" />
        </Field>
        <Notice error={state.error} fields={state.fields} />
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Connecting…" : "Connect"}
          </Button>
        ) : (
          <p className="text-[13px] text-muted">Only an owner can connect a domain.</p>
        )}
      </form>
    </section>
  );
}

const RECORD_PILL = { found: ["success", "Found"], waiting: ["warning", "Waiting"], wrong: ["alert", "Not right yet"] } as const;

function Connected({ status, canEdit }: { status: DomainView; canEdit: boolean }) {
  const [checking, startCheck] = useTransition();
  const [state, setState] = useState<DomainFormState>({});
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const allFound = status.records.every((r) => r.status === "found");
  const headline = status.connected ? "Connected" : allFound && !status.automatic ? "Records are in" : "Waiting for DNS";
  return (
    <>
      <section>
        <Label>Your own domain</Label>
        <Card className="divide-y divide-line-soft">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <p data-testid="domain-name" className="min-w-0 flex-1 break-all font-mono text-[14px] text-text">
              {status.primary}
            </p>
            <span data-testid="domain-state">
              <Pill tone={status.connected ? "success" : "warning"}>{headline}</Pill>
            </span>
          </div>
          <div className="px-4 py-3.5">
            {status.connected ? (
              <p className="text-[13px] leading-[1.5] text-body">Both records are right and your site answers on this domain.</p>
            ) : (
              <p className="text-[13px] leading-[1.5] text-body">
                {status.records.length === 1 ? "This is the record it needs." : `These are the ${status.records.length === 2 ? "two" : status.records.length} records it needs.`} They go in your domain provider&apos;s DNS settings — where you bought the domain. Not sure who that is? Ask us and we&apos;ll look. Changes usually reach the internet within an hour.
              </p>
            )}
            {status.ownership.length > 0 && (
              <div className="mt-3 rounded-card bg-sunken p-3">
                <p className="text-[13px] text-text">First, prove it&apos;s yours</p>
                <p className="mt-0.5 text-[12.5px] text-muted">This domain is used on another Vercel account. Add this record too; it can come out again once connected.</p>
                {status.ownership.map((o) => (
                  <RecordRow key={o.value} type={o.type} name={o.name} value={o.value} />
                ))}
              </div>
            )}
          </div>
          {status.records.map((r) => (
            <div key={`${r.type}${r.name}`} data-testid={`record-${r.type}`} className="px-4 py-3.5">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 font-mono text-[12.5px] text-muted">
                  {r.type} · {r.name}
                </p>
                <Pill tone={RECORD_PILL[r.status][0]}>{RECORD_PILL[r.status][1]}</Pill>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <p className="min-w-0 flex-1 break-all font-mono text-[14px] text-text">{r.value}</p>
                <Copy text={r.value} />
              </div>
              {r.status === "wrong" && <p className="mt-1 text-[12.5px] text-alert">Something else is there now. Change it to this.</p>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <Button type="button" variant="secondary" size="sm" disabled={checking} onClick={() => startCheck(() => checkDomainAction())}>
              {checking ? "Checking…" : "Check now"}
            </Button>
            <span className="text-[12.5px] text-muted">We check every time this page opens.</span>
          </div>
          {!status.automatic && (
            <p className="px-4 py-3.5 text-[12.5px] leading-[1.5] text-warning">Domains aren&apos;t added automatically on this platform yet: once the records are in, output/input switches it on by hand.</p>
          )}
        </Card>
      </section>

      <section>
        <Label>Security</Label>
        <Card variant="static" className="px-4 py-3.5">
          <p data-testid="domain-security" className="text-[14px] text-text">
            {status.connected ? "Secure" : "Not yet"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">
            {status.connected ? "The padlock shows in the browser and the certificate renews itself. Nothing to do." : "Turns on by itself within minutes of both records being right. Nothing to buy, nothing to renew."}
          </p>
        </Card>
      </section>

      {status.apex && status.domain && (
        <section>
          <Label>With or without www</Label>
          <div role="radiogroup" aria-label="Main address" className="space-y-2">
            {[false, true].map((www) => {
              const host = www ? `www.${status.domain}` : status.domain!;
              const on = status.www === www;
              return (
                <button
                  key={host}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canEdit || busy}
                  onClick={() => start(async () => setState(await setDomainWwwAction(www)))}
                  className={`flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left font-mono text-[14px] ${on ? "border-accent bg-surface text-text" : "border-line text-body hover:bg-hover"} disabled:opacity-60`}
                >
                  <span aria-hidden className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${on ? "border-accent" : "border-line-strong"}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-accent" />}
                  </span>
                  {host}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">The other one sends people to this one, so both addresses always work.</p>
          <div className="mt-1">
            <Notice {...state} />
          </div>
        </section>
      )}

      {canEdit && (
        <section>
          {confirm ? (
            <Card className="space-y-3 p-4">
              <p className="text-[14px] text-text">Disconnect {status.primary}?</p>
              <p className="text-[12.5px] leading-[1.5] text-muted">The site stops answering on it. {slugHostNote}</p>
              <div className="flex gap-2">
                <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => start(async () => setState(await disconnectDomainAction()))}>
                  Disconnect
                </Button>
                <Button type="button" variant="quiet" size="sm" onClick={() => setConfirm(false)}>
                  Keep it
                </Button>
              </div>
            </Card>
          ) : (
            <Button type="button" variant="quiet" size="sm" onClick={() => setConfirm(true)}>
              Disconnect this domain
            </Button>
          )}
        </section>
      )}
    </>
  );
}

const slugHostNote = "Your other address keeps working, and you can connect it again any time.";

function GoingLive({ launchedAt, address, previewUrl, canEdit }: { launchedAt: string | null; address: string; previewUrl: string; canEdit: boolean }) {
  const [state, setState] = useState<DomainFormState>({});
  const [busy, start] = useTransition();
  const [confirmHide, setConfirmHide] = useState(false);
  return (
    <section>
      <Label>Going live</Label>
      {launchedAt ? (
        <div className="space-y-3">
          <Card variant="static" className="px-4 py-3.5">
            <p data-testid="live-state" className="text-[14px] text-text">
              Live since {new Date(launchedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">Anyone can reach your site at {address}.</p>
          </Card>
          {canEdit &&
            (confirmHide ? (
              <Card className="space-y-3 p-4">
                <p className="text-[14px] text-text">Hide the site again?</p>
                <p className="text-[12.5px] leading-[1.5] text-muted">Visitors see the holding page until you launch it again, and search engines are asked to stay away. You, and anyone with the preview link, still see the real site.</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await hideSiteAction();
                        setState(r);
                        if (!r.error) setConfirmHide(false);
                      })
                    }
                  >
                    {busy ? "Hiding…" : "Hide it"}
                  </Button>
                  <Button type="button" variant="quiet" size="sm" onClick={() => setConfirmHide(false)}>
                    Keep it live
                  </Button>
                </div>
                <Notice error={state.error} />
              </Card>
            ) : (
              <Button type="button" variant="quiet" size="sm" onClick={() => setConfirmHide(true)}>
                Hide it again
              </Button>
            ))}
        </div>
      ) : (
        <Card className="space-y-3 px-4 py-3.5">
          <div>
            <p data-testid="live-state" className="text-[14px] text-text">
              Not live yet
            </p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">Anyone visiting sees a holding page. You, and anyone you send the preview link to, see the real site.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-button border border-line px-3.5 text-[13.5px] text-text hover:bg-hover">
              Open the real site
            </a>
            <Copy text={previewUrl} label="Copy preview link" />
          </div>
          <p className="text-[12px] text-muted">The preview link works for 30 days. Anyone with it can see the site, so share it with care.</p>
          {canEdit ? (
            <Button type="button" disabled={busy} onClick={() => start(async () => setState(await launchSiteAction()))}>
              {busy ? "Launching…" : "Launch site"}
            </Button>
          ) : (
            <p className="text-[13px] text-muted">Only an owner can launch the site.</p>
          )}
          <Notice error={state.error} />
        </Card>
      )}
    </section>
  );
}

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
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
      {done ? "Copied" : label}
    </button>
  );
}

function RecordRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <div className="mt-2">
      <p className="font-mono text-[12px] text-muted">
        {type} · {name}
      </p>
      <div className="mt-1 flex items-center gap-3">
        <p className="min-w-0 flex-1 break-all font-mono text-[13px] text-text">{value}</p>
        <Copy text={value} />
      </div>
    </div>
  );
}
