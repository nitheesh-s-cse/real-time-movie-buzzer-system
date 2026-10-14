import { desc } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";

/**
 * This event app runs a single live event at a time (one quiz night).
 * Returns the most recently created event, creating a default draft one
 * on first use so the admin dashboard always has something to control.
 */
export async function getOrCreateActiveEvent() {
  const [latest] = await db.select().from(events).orderBy(desc(events.createdAt)).limit(1);
  if (latest) return latest;

  const [created] = await db
    .insert(events)
    .values({ name: "Guess the Movie", status: "draft" })
    .returning();
  return created;
}
