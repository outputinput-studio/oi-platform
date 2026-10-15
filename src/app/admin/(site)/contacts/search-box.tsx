"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Input } from "../../ui";

/** Search the list; the address carries the words so a search can be shared or refreshed. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        router.replace(q ? `/contacts?q=${encodeURIComponent(String(q))}` : "/contacts");
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
          timer.current = setTimeout(() => router.replace(q ? `/contacts?q=${encodeURIComponent(q)}` : "/contacts"), 350);
        }}
      />
    </form>
  );
}
