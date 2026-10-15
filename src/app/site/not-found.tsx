import Link from "next/link";

/** Every dead end has a way out. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold">That page isn&apos;t here</h1>
      <p className="mt-2 text-[var(--muted)]">It may have moved, or the link may be wrong.</p>
      <Link href="/" className="mt-6 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium">
        Go to the front page
      </Link>
    </main>
  );
}
