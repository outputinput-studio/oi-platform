"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary navigation. A bottom bar on a phone, a side rail on a laptop,
 * the same links either way. Paths are the public ones (the proxy
 * maps them onto /admin/*), so never link to /admin here.
 */
const items = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/pages", label: "Pages", icon: PagesIcon },
  { href: "/media", label: "Pictures", icon: PictureIcon },
  { href: "/team", label: "Team", icon: PeopleIcon },
  { href: "/settings", label: "Settings", icon: CogIcon },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--border)] bg-[var(--bg)] md:static md:flex-col md:border-t-0 md:py-2"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={
              "flex flex-1 flex-col items-center gap-1 px-2 py-2 text-xs md:flex-none md:flex-row md:gap-3 md:px-5 md:py-2.5 md:text-sm " +
              (active ? "text-[var(--fg)]" : "text-[var(--muted)] hover:text-[var(--fg)]")
            }
          >
            <Icon active={active} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

type IconProps = { active: boolean };
const stroke = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 2.2 : 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...stroke(active)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </svg>
  );
}
function PagesIcon({ active }: IconProps) {
  return (
    <svg {...stroke(active)}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6M10 17h6" />
    </svg>
  );
}
function PictureIcon({ active }: IconProps) {
  return (
    <svg {...stroke(active)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-7 7" />
    </svg>
  );
}
function PeopleIcon({ active }: IconProps) {
  return (
    <svg {...stroke(active)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.5c3 .2 5.5 2.3 5.5 5.5" />
    </svg>
  );
}
function CogIcon({ active }: IconProps) {
  return (
    <svg {...stroke(active)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
