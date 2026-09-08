import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Resets counters only for mailboxes whose last reset wasn't today (by calendar date, not a
 * fixed 24h window) — so this is safe to call frequently as a self-healing check rather than
 * relying on a cron firing at exactly the right instant. If the worker process is down at
 * midnight (e.g. during an outage), the next tick after it comes back catches up automatically
 * instead of silently skipping that day's reset.
 */
export async function resetDailyCounters() {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE mailboxes
    SET sent_today = 0, delivered_today = 0, bounced_today = 0, replied_today = 0, unsubscribes_today = 0,
        counters_reset_at = now()
    WHERE counters_reset_at::date < now()::date
    RETURNING id
  `);
  return { reset: result.length };
}
