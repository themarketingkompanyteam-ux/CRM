import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";

/**
 * Effective daily cap for the mailbox's current phase. Sends here are always real campaign
 * traffic — "warmup" is a controlled ramp on that same real traffic, not a synthetic
 * warmup-network category, so only one cap applies at a time:
 * - not_started: 0 (must explicitly start warmup before it can send)
 * - warming: today's ramp value (warmupDailyLimit)
 * - warmed: the steady-state campaign cap (campaignDailyLimit)
 * - paused (health): 0
 */
export function effectiveDailyLimit(mailbox: { warmupStatus: string; healthStatus: string; warmupDailyLimit: number; campaignDailyLimit: number }): number {
  if (mailbox.healthStatus === "paused") return 0;
  if (mailbox.warmupStatus === "warmed") return mailbox.campaignDailyLimit;
  if (mailbox.warmupStatus === "warming") return mailbox.warmupDailyLimit;
  return 0;
}

/**
 * Picks the least-utilized eligible mailbox: connected, campaign-enabled, not health-paused,
 * and under its phase-appropriate daily cap. Never round-robins blindly — always favors
 * whichever eligible mailbox has sent the least today, spreading load naturally.
 */
export async function pickMailboxForSend(candidateMailboxIds?: number[]) {
  const conditions = [
    eq(mailboxes.connectionStatus, "connected"),
    eq(mailboxes.campaignEnabled, 1),
    sql`${mailboxes.healthStatus} != 'paused'`,
    sql`${mailboxes.warmupStatus} IN ('warming', 'warmed')`,
  ];
  if (candidateMailboxIds && candidateMailboxIds.length > 0) {
    conditions.push(sql`${mailboxes.id} = ANY(${candidateMailboxIds})`);
  }

  const candidates = await db
    .select()
    .from(mailboxes)
    .where(and(...conditions))
    .orderBy(asc(mailboxes.sentToday));

  return candidates.find((m) => m.sentToday < effectiveDailyLimit(m)) ?? null;
}
