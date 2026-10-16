"use client";

import { useState, useTransition } from "react";
import { saveAccountSettingsAction, type AccountSettingsState } from "@/modules/customers/admin-actions";
import type { AccountSettings } from "@/modules/customers/settings";
import { Card, Label, Notice, Pill, Row, Rows, Switch } from "../../../ui";

/**
 * Two switches, saved as they're flipped: accounts, and (inside it)
 * passwords. Then what customers get, and the one thing that's always on.
 */
export function AccountsForm({ initial, canEdit, customers }: { initial: AccountSettings; canEdit: boolean; customers: number }) {
  const [v, setV] = useState(initial);
  const [state, setState] = useState<AccountSettingsState>({});
  const [pending, start] = useTransition();
  const save = (next: AccountSettings) => {
    const was = v;
    setV(next);
    start(async () => {
      const r = await saveAccountSettingsAction(next);
      if (r.error) setV(was);
      setState(r);
    });
  };
  return (
    <div className="space-y-7">
      <section>
        <Card className="divide-y divide-line-soft">
          <div className="p-4">
            <Switch
              checked={v.enabled}
              disabled={!canEdit || pending}
              onChange={(enabled) => save({ enabled, passwords: enabled && v.passwords })}
              label="Customer accounts"
              hint="Customers sign in with a code sent to their email. No passwords, so nothing to reset."
            />
          </div>
          {v.enabled && (
            <div className="p-4">
              <Switch
                checked={v.passwords}
                disabled={!canEdit || pending}
                onChange={(passwords) => save({ ...v, passwords })}
                label="Let customers set a password"
                hint="Codes stay the way everyone signs in. This only lets someone who wants a password have one. There is still nothing to reset — a code always gets them in."
              />
            </div>
          )}
        </Card>
        <div className="mt-2 min-h-5">
          <Notice {...state} />
        </div>
        {!canEdit && <p className="text-[13px] text-muted">Only an owner can change this.</p>}
      </section>

      <section>
        <Label right={customers ? `${customers} account${customers === 1 ? "" : "s"} so far` : undefined}>What they get</Label>
        <Rows variant="static">
          <Row title="Their orders" detail="Status, tracking and a buy-again action" />
          <Row title="Saved addresses" detail="Fills in checkout for them next time" />
          <Row title="Their waiting list" detail="The sold-out pieces they asked about" />
        </Rows>
      </section>

      <section>
        <Label>Always on</Label>
        <Rows variant="static">
          <Row title="Order tracking page" detail="Order number and email, and they see where their parcel is. No account, no sign-in. At /track on your site." right={<Pill tone="success">On</Pill>} />
        </Rows>
        <p className="mt-2 text-[12.5px] text-muted">Not a setting — most people never sign in, and they all want to know where their parcel is.</p>
      </section>

      <p className="text-[13px] leading-relaxed text-muted">Nobody has to sign in to buy. Turning accounts off leaves guest checkout and the tracking page exactly as they are.</p>
    </div>
  );
}
