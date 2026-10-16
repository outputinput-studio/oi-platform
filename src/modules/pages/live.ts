import { and, eq, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { articles, pages } from "@/db/schema";

/**
 * What "live" means, in one place: published, or scheduled and the time
 * has come. No job runner flips anything; the clock does, at read time.
 */
export function pageIsLive(): SQL {
  return and(isNull(pages.deletedAt), or(eq(pages.status, "published"), and(eq(pages.status, "scheduled"), lte(pages.publishedAt, sql`now()`))))!;
}

export function articleIsLive(): SQL {
  return and(isNull(articles.deletedAt), or(eq(articles.status, "published"), and(eq(articles.status, "scheduled"), lte(articles.publishedAt, sql`now()`))))!;
}

/** The same test in code, for a row already loaded. */
export function isLive(row: { status: string; publishedAt: Date | null }, now = new Date()): boolean {
  return row.status === "published" || (row.status === "scheduled" && !!row.publishedAt && row.publishedAt <= now);
}
