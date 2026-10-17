"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Input } from "../../ui";

/**
 * Search the list; the address carries the words so a search can be shared or refreshed.
 * `base` is the page searched (the contacts list, or merge's "who else"), with any of its own query.
 */
export function SearchBox({ initial, base = "/contacts" }: { initial: string; base?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const to = (q: string) => (q ? `${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}` : base);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        router.replace(to(q ? String(q) : ""));
      }}
    >
      <Input
        name="q"
        type="search"
        aria-label="Search contacts"
        placeholder="Search names, emails, phones, notes"
        defaultValue={initial}
        autoComplete="off"
        onChange={(e) => {
          const q = e.target.value;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.replace(to(q)), 350);
        }}
      />
    </form>
  );
}
