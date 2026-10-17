import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { named } from "@/lib/form-error";

/**
 * Your account: the parts a person changes about themselves. Users are a
 * platform table; these take the signed-in user, never an id from a form.
 */

const nameSchema = z.string().trim().min(1, "Put your name in.").max(80, "Keep it under 80 characters.");

/** The name the team sees: on Team, in Activity ("Michelle moved order 1041…"), in emails. */
export async function updateName(userId: string, name: string): Promise<string> {
  const clean = named("name", nameSchema, name);
  await db.update(users).set({ name: clean, updatedAt: new Date() }).where(eq(users.id, userId));
  return clean;
}
