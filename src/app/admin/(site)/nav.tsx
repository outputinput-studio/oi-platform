"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "../ui";

/**
 * Primary navigation, following design/admin.html.
 *
 * Laptop: a sidebar with the wordmark, one row per area, and the signed-in
 * person at the bottom. Phone: a tab bar with Home, Content, Images and
 * More, where More opens a sheet with the rest. One <nav>, two lists,
 * CSS picks which shows, so there is exactly one "Team" link on the page.
 *
 * Paths are the public ones (the proxy maps them onto /admin/*).
 */
type Item = { href: string; label: string; icon: (p: IconProps) => React.ReactNode; hint?: string };

const primary: Item[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/pages", label: "Content", icon: ContentIcon, hint: "Pages" },
  { href: "/media", label: "Images", icon: ImageIcon },
];
const secondary: Item[] = [
  { href: "/team", label: "Team", icon: PeopleIcon },
  { href: "/settings", label: "Settings", icon: CogIcon },
];

export function Nav({
  siteName,
  userName,
  role,
  envName,
  signOut,
}: {
  siteName: string;
  userName: string;
  role: string;
  envName: string | null;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const active = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  const moreActive = secondary.some((i) => active(i.href)) || active("/account");

  return (
    <nav aria-label="Main">
      {/* ── laptop sidebar ───────────────────────────────── */}
      <div className="hidden md:fixed md:inset-y-0 md:left-0 md:flex md:w-[290px] md:flex-col md:border-r md:border-line md:bg-bg">
        <div className="flex h-[90px] flex-none items-center gap-3 border-b border-line px-6">
          <Wordmark />
          {envName && <span className="label !text-faint">{envName}</span>}
        </div>
        <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3">
          {[...primary, ...secondary].map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active(it.href) ? "page" : undefined}
                className={`flex h-11 items-center gap-[11px] rounded-[6px] px-3 text-[14.5px] ${
                  active(it.href) ? "bg-selected font-medium text-text" : "text-body hover:bg-hover"
                }`}
              >
                <it.icon size={19} />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/account" className="flex flex-none items-center gap-3 border-t border-line px-5 py-4 hover:bg-hover">
          <Avatar name={userName} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium">{userName}</span>
            <span className="block text-[12.5px] capitalize text-muted">{role}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-faint" aria-hidden>
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* ── phone tab bar ────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg px-1 pb-[max(22px,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
        {primary.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? "page" : undefined}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-[5px] ${active(it.href) ? "text-text" : "text-nav"}`}
          >
            <it.icon size={22} />
            <span className="text-[10.5px] tracking-[0.1px]">{it.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          className={`flex h-14 flex-1 flex-col items-center justify-center gap-[5px] ${moreActive ? "text-text" : "text-nav"}`}
        >
          <MoreIcon size={22} />
          <span className="text-[10.5px] tracking-[0.1px]">More</span>
        </button>
      </div>

      {more && (
        <Sheet title={siteName} onClose={() => setMore(false)}>
          <ul className="divide-y divide-line-soft">
            {secondary.map((it) => (
              <li key={it.href}>
                <Link href={it.href} onClick={() => setMore(false)} className="flex h-[66px] items-center gap-4 text-[16.5px]">
                  <it.icon size={21} />
                  <span className="flex-1">{it.label}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/account" onClick={() => setMore(false)} className="flex h-[66px] items-center gap-4 text-[16.5px]">
                <PersonIcon size={21} />
                <span className="flex-1">Your account</span>
                <span className="text-[13.5px] text-muted">{userName.split(" ")[0]}</span>
              </Link>
            </li>
            <li>
              <form action={signOut}>
                <button type="submit" className="flex h-[66px] w-full items-center gap-4 text-left text-[16.5px] text-muted">
                  <SignOutIcon size={21} />
                  <span className="flex-1">Sign out</span>
                </button>
              </form>
            </li>
          </ul>
          {envName && <p className="label mt-4 text-center !text-faint">{envName}</p>}
        </Sheet>
      )}
    </nav>
  );
}

export function Wordmark({ className = "h-[13px]" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static SVG
  return <img src="/brand/wordmark-white.svg" alt="output/input" width={180} height={26} className={`w-auto ${className}`} />;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="flex flex-none items-center justify-center rounded-full bg-selected font-semibold text-accent-text"
    >
      {initials || "?"}
    </span>
  );
}

type IconProps = { size: number };
const svg = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  className: "flex-none",
});

function HomeIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}
function ContentIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}
function ImageIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-7 7" />
    </svg>
  );
}
function PeopleIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c3 .2 5.5 2.3 5.5 5.5" />
    </svg>
  );
}
function PersonIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}
function CogIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
function MoreIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
function SignOutIcon({ size }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}
