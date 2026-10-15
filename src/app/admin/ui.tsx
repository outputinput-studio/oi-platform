/**
 * The handful of primitives the admin is built from. Tokens only; no raw
 * colours. Everything is sized for a thumb first.
 */
export function Button({
  children,
  variant = "primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" }) {
  const base = "rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-60";
  const look =
    variant === "primary"
      ? "bg-[var(--accent)] text-[var(--fg)]"
      : variant === "danger"
        ? "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--fg)]"
        : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]";
  return (
    <button {...rest} className={`${base} ${look} ${rest.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`block w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-3 text-base outline-none focus:border-[var(--accent)] ${props.className ?? ""}`}
    />
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm text-[var(--muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`text-sm ${error ? "text-[var(--fg)]" : "text-[var(--muted)]"}`}
    >
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
export function SaveBar({
  dirty,
  pending,
  state,
}: {
  dirty: boolean;
  pending: boolean;
  state: { ok?: string; error?: string };
}) {
  return (
    <>
      {/* Keeps the end of the page clear of the bar. */}
      <div aria-hidden className="h-16" />
      <div
        data-testid="save-bar"
        className="fixed inset-x-0 bottom-[59px] z-10 flex items-center justify-center gap-4 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3 shadow-[0_-8px_24px_var(--shadow)] md:bottom-0"
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
