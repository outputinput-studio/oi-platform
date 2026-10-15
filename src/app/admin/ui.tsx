import Link from "next/link";

/**
 * The primitives the admin is built from, following design/admin.html.
 * Tokens only; no raw colours. Everything is sized for a thumb first:
 * controls are 44 px tall, buttons 5 px radius, cards 8 px.
 */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger"; size?: "md" | "sm" }) {
  const base = "inline-flex items-center justify-center rounded-button font-medium disabled:opacity-50 disabled:cursor-default";
  const dims = size === "sm" ? "h-9 px-3.5 text-[13.5px]" : "h-11 px-5 text-[15px]";
  const look = {
    primary: "bg-accent text-text hover:bg-accent-hover",
    secondary: "border border-line-strong text-text hover:bg-hover",
    quiet: "border border-line text-body hover:text-text hover:bg-hover",
    danger: "border border-line text-alert hover:bg-alert-bg",
  }[variant];
  return (
    <button {...rest} className={`${base} ${dims} ${look} ${className}`}>
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block h-11 w-full rounded-button border border-control bg-transparent px-3.5 text-[15px] text-text outline-none placeholder:text-faint focus:border-accent read-only:border-line read-only:text-body ${className}`}
    />
  );
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`block w-full rounded-button border border-control bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-accent ${className}`}
    />
  );
}

/** A field: plain label above the control, optional hint below. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] text-body">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** The small mono uppercase label above a group: "SECTIONS", "YOU". */
export function Label({ children, className = "", right }: { children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <div className={`mb-2.5 flex items-center justify-between ${className}`}>
      <span className="label">{children}</span>
      {right && <span className="text-[12.5px] text-muted">{right}</span>}
    </div>
  );
}

/**
 * A card. Bordered on the surface colour when it's something to tap or
 * fill in; `static` (no border, sunken) when it only tells you something.
 */
export function Card({ children, className = "", variant = "default", ...rest }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "static" }) {
  const look = variant === "static" ? "bg-sunken" : "border border-line bg-surface";
  return (
    <div {...rest} className={`rounded-card ${look} ${className}`}>
      {children}
    </div>
  );
}

/** A status pill: Live, Draft, Scheduled. */
export function Pill({ tone, children }: { tone: "success" | "warning" | "alert" | "neutral"; children: React.ReactNode }) {
  const look = {
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    alert: "bg-alert-bg text-alert",
    neutral: "border border-line text-muted",
  }[tone];
  return <span className={`inline-block rounded px-[7px] py-[3px] text-[10.5px] font-medium ${look}`}>{children}</span>;
}

/**
 * A row in a list card: title, line underneath, chevron. Rows stack inside
 * a Card with a soft line between them. A link when `href` is given.
 */
export function Row({
  title,
  detail,
  href,
  right,
  icon,
  onClick,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {icon && <span className="flex w-6 flex-none items-center justify-center text-body">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-text">{title}</span>
        {detail && <span className="mt-0.5 block text-[13px] text-muted">{detail}</span>}
      </span>
      {right ?? (href || onClick ? <Chevron /> : null)}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-hover first:rounded-t-card last:rounded-b-card";
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls.replace(" hover:bg-hover", "")}>{inner}</div>;
}

/** Rows separated by a soft line, inside a Card. `static` when none of them go anywhere. */
export function Rows({ children, className = "", variant }: { children: React.ReactNode; className?: string; variant?: "default" | "static" }) {
  return (
    <Card variant={variant} className={`divide-y divide-line-soft ${className}`}>
      {children}
    </Card>
  );
}

export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`flex-none text-faint ${className}`} aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className={`text-[13px] ${error ? "text-alert" : "text-success"}`}>
      {ok && !error && <span className="mr-1">✓</span>}
      {error ?? ok}
    </p>
  );
}

/**
 * A bar across the bottom of the screen with Save in the middle, for forms
 * that save on demand (sections autosave and don't use it). Greyed out
 * until something changes, and again once it's saved; Saved / the error
 * sits beside the button. On a phone it rests on top of the bottom
 * navigation; on a laptop it's flush with the bottom edge.
 */
export function SaveBar({ dirty, pending, state }: { dirty: boolean; pending: boolean; state: { ok?: string; error?: string } }) {
  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div aria-hidden className="h-16" />
      <div
        data-testid="save-bar"
        className="fixed inset-x-0 bottom-[84px] z-10 flex items-center justify-center gap-4 border-t border-line bg-bg px-4 py-3 shadow-[0_-8px_24px_var(--shadow)] md:bottom-0 md:left-[290px]"
      >
        {!dirty && !pending && <Notice {...state} />}
        {dirty && !pending && state.error && <Notice error={state.error} />}
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}

/**
 * The header of a screen: a back arrow when there's somewhere to go back
 * to, the title, and actions on the right. 52 px on a phone, taller on a
 * laptop, with a line underneath. Every screen renders one.
 */
export function PageHeader({
  title,
  back,
  actions,
  titleTestId,
}: {
  title: React.ReactNode;
  back?: string;
  actions?: React.ReactNode;
  titleTestId?: string;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 flex h-[52px] items-center gap-1.5 border-b border-line bg-bg px-2 md:static md:mx-0 md:h-[90px] md:gap-3 md:px-0">
      {back ? (
        <Link href={back} aria-label="Back" className="flex h-11 w-11 flex-none items-center justify-center rounded-button text-text hover:bg-hover">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      ) : (
        <span className="w-3.5 md:w-0" />
      )}
      <h1 data-testid={titleTestId} className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.25px] md:text-[26px] md:tracking-[-0.5px]">
        {title}
      </h1>
      {actions && <div className="flex flex-none items-center gap-2 pr-1.5 md:pr-0">{actions}</div>}
    </header>
  );
}

export { Sheet } from "./sheet";
