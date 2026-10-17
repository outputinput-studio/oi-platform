"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { finishWelcomeAction, skipSecureNudgeAction } from "@/modules/welcome/actions";
import { Button, Card, Sheet } from "../ui";

/**
 * First run on Home (design/admin.html): "Welcome, Michelle." with Show me
 * around (the four things, as a sheet) or Dismiss. Either way it's gone for
 * good on this site. Staff get the three things their screens hold.
 */
type Thing = { title: string; body: string };

export function Welcome({ name, live, staff }: { name: string; live: boolean; staff: boolean }) {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const [saving, start] = useTransition();
  const first = name.split(/[\s@]/)[0] || name;
  // Gone once it's saved, so leaving the page straight away can't lose it.
  const finish = () => {
    setOpen(false);
    start(async () => {
      await finishWelcomeAction();
      setGone(true);
    });
  };
  if (gone) return null;

  const things: Thing[] = staff
    ? [
        { title: "An order comes in", body: "It lands in Orders. Change its status as you go — the customer gets an email each time." },
        { title: "Someone gets in touch", body: "That's the Inbox. Every enquiry from the site sits there with their details." },
        { title: "Who's who", body: "Contacts, under More. Everyone who has written or bought, with your team's notes." },
      ]
    : [
        { title: "An order comes in", body: "It lands on this first screen and in Orders. Change its status as you go — the customer gets an email each time." },
        { title: "Someone gets in touch", body: "That's the Inbox. Every enquiry from your site sits there with their details." },
        { title: "Something new to sell", body: "Products, then New product at the top. A photo from your camera roll, a price, and it's on the site." },
        { title: "Words on the website", body: "Content, under More on a phone. Pages, your journal, forms and menus all live there." },
      ];

  return (
    <>
      <Card variant="static" className="mt-5 p-5" data-testid="welcome">
        <p className="text-[17px] font-semibold">Welcome, {first}.</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-body">
          {staff ? "Your orders arrive here. Your enquiries are in the Inbox." : "Your orders arrive here. Your enquiries are in the Inbox. Everything on your website is under Content."}
        </p>
        <div className="mt-4 flex gap-2">
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={saving}>
            Show me around
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={finish} disabled={saving}>
            Dismiss
          </Button>
        </div>
      </Card>
      {open && (
        <Sheet title={`${staff ? "Three" : "Four"} things and you're set`} onClose={() => setOpen(false)}>
          <p className="text-[14px] text-body">
            {live ? "Your site is already built and live. " : "Your site is already built. "}
            Nothing here needs setting up.
          </p>
          <ol className="mt-4 space-y-4">
            {things.map((t, i) => (
              <li key={t.title} className="flex gap-3.5" data-testid="tour-step">
                <span className="label flex h-7 w-7 flex-none items-center justify-center rounded-full border border-line-strong !text-text">{i + 1}</span>
                <span>
                  <span className="block text-[15px] font-medium">{t.title}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-relaxed text-body">{t.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Button type="button" onClick={finish} className="mt-6 w-full">
            Got it
          </Button>
          <p className="mt-3 text-center text-[12.5px] text-muted">
            Stuck on anything at all —{" "}
            <Link href="/help?from=/" className="text-accent-text underline underline-offset-4">
              Get help
            </Link>{" "}
            under More.
          </p>
        </Sheet>
      )}
    </>
  );
}

/** After the welcome, for anyone without the authenticator app: "Make your sign-in harder to copy". */
export function SecureNudge() {
  const [gone, setGone] = useState(false);
  const [saving, start] = useTransition();
  if (gone) return null;
  return (
    <Card variant="static" className="mt-5 p-5" data-testid="secure-nudge">
      <p className="text-[17px] font-semibold">Make your sign-in harder to copy</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-body">
        Now you know your way around: add a code from an app on your phone on top of the emailed one. It takes two minutes, and this login can see your
        customers.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/two-factor?next=/" className="inline-flex h-9 items-center rounded-button bg-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-accent-hover">
          Set it up
        </Link>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={() =>
            start(async () => {
              await skipSecureNudgeAction();
              setGone(true);
            })
          }
        >
          Not yet
        </Button>
      </div>
    </Card>
  );
}
