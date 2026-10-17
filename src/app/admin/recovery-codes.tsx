"use client";

import { useState } from "react";
import { Button } from "./ui";

/**
 * The ten recovery codes, shown once: right after the app is set up, or
 * when a new set is made. Copy or download them; we only keep hashes, so
 * nobody can show them again.
 */
export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `output/input recovery codes\nEach one works once, in place of the code from your app.\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "output-input-recovery-codes.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div data-testid="recovery-codes">
      <p className="label">Your recovery codes</p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-body">
        If you lose your phone, one of these gets you in instead of the app&apos;s code. Each works once. Keep them somewhere safe that isn&apos;t your phone —
        we can&apos;t show them again.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-card border border-line bg-sunken p-4 font-mono text-[15px] tracking-[1px]">
        {codes.map((c) => (
          <li key={c} data-testid="recovery-code">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy them"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={download}>
          Download
        </Button>
      </div>
    </div>
  );
}
