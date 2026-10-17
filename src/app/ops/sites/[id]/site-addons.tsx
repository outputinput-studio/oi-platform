"use client";

import { useActionState } from "react";
import { opsSiteAddonAction, type AddonFormState } from "@/modules/addons/actions";
import { perMonth, type Addon } from "@/modules/addons/addon";
import { Button, Notice } from "../../../admin/ui";

/** A site's add-ons, from ops: add or take off any of them, the "Ask us" ones included. */
export function SiteAddons({ siteId, addons }: { siteId: string; addons: (Addon & { id: string; has: boolean })[] }) {
  return (
    <div className="divide-y divide-line rounded-card border border-line bg-surface">
      {addons.map((a) => (
        <Row key={a.id} siteId={siteId} a={a} />
      ))}
    </div>
  );
}

function Row({ siteId, a }: { siteId: string; a: Addon & { id: string; has: boolean } }) {
  const [state, act, pending] = useActionState(opsSiteAddonAction, {} as AddonFormState);
  return (
    <form action={act} data-testid="ops-addon" className="flex flex-wrap items-center gap-3 px-4 py-3">
      <input type="hidden" name="siteId" value={siteId} />
      <input type="hidden" name="addonId" value={a.id} />
      <input type="hidden" name="op" value={a.has ? "remove" : "add"} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px]">
          {a.name} {a.has && <span className="text-[12.5px] text-success">✓ on</span>}
        </p>
        <p className="font-mono text-[12px] text-muted">
          {perMonth(a)} · {a.selfServe ? "self-serve" : "ask us"}
        </p>
      </div>
      <Button type="submit" size="sm" variant={a.has ? "danger" : "secondary"} disabled={pending} aria-label={`${a.has ? "Take off" : "Add"}: ${a.name}`}>
        {pending ? "…" : a.has ? "Take off" : "Add"}
      </Button>
      <Notice error={state.error} />
    </form>
  );
}
