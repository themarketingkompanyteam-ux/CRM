import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, mailboxAuditLog } from "@/db/schema";
import { calculateMailboxHealth } from "./health";

/**
 * Default conservative ramp: start at 5/day, +1/day up to day 14 (~19/day), then hold until
 * the operator marks it "warmed" (or raise WARMUP_RAMP_DAYS). These are defaults, not
 * guarantees of safe deliverability — configurable per the health checks below.
 */
export const DEFAULT_WARMUP_START = 5;
export const DEFAULT_WARMUP_INCREMENT = 1;
export const DEFAULT_WARMUP_DAYS = 14;

export async function startWarmup(mailboxId: number) {
  await db
    .update(mailboxes)
    .set({
      warmupStatus: "warming",
      warmupStartedAt: new Date(),
      warmupDay: 1,
      warmupDailyLimit: DEFAULT_WARMUP_START,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, mailboxId));
  await db.insert(mailboxAuditLog).values({ mailboxId, action: "warmup_started", metadata: { startVolume: DEFAULT_WARMUP_START } });
}

/**
 * Runs once per day per warming mailbox. Never fabricates engagement — this only decides
 * whether to raise, hold, reduce, or pause the REAL sending cap based on yesterday's actual
 * delivery data (bounces are the only reliable signal we have without provider reputation APIs).
 */
export async function processMailboxWarmup(mailboxId: number) {
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
  if (!mailbox || mailbox.warmupStatus !== "warming") return null;

  const health = calculateMailboxHealth(mailbox);
  const nextDay = mailbox.warmupDay + 1;
  let nextLimit = mailbox.warmupDailyLimit;
  let decision: "increase" | "hold" | "decrease" | "pause" = "hold";

  if (health.status === "paused") {
    decision = "pause";
  } else if (health.status === "throttled") {
    decision = "decrease";
    nextLimit = Math.max(DEFAULT_WARMUP_START, Math.floor(mailbox.warmupDailyLimit / 2));
  } else if (health.status === "monitoring") {
    decision = "hold";
  } else if (nextDay <= DEFAULT_WARMUP_DAYS) {
    decision = "increase";
    nextLimit = mailbox.warmupDailyLimit + DEFAULT_WARMUP_INCREMENT;
  } else {
    decision = "hold";
  }

  const isPausing = decision === "pause";
  const isGraduating = nextDay > DEFAULT_WARMUP_DAYS && decision !== "decrease" && health.status === "healthy";

  await db
    .update(mailboxes)
    .set({
      warmupDay: isPausing ? mailbox.warmupDay : nextDay,
      warmupDailyLimit: nextLimit,
      warmupStatus: isPausing ? "paused" : isGraduating ? "warmed" : "warming",
      campaignEnabled: isPausing ? 0 : mailbox.campaignEnabled,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, mailboxId));

  await db.insert(mailboxAuditLog).values({
    mailboxId,
    action: isPausing ? "warmup_paused" : isGraduating ? "warmup_graduated" : `warmup_${decision}`,
    reason: health.reasons.join("; "),
    metadata: { day: nextDay, previousLimit: mailbox.warmupDailyLimit, nextLimit, healthScore: health.score },
  });

  return { decision, previousLimit: mailbox.warmupDailyLimit, nextLimit, day: nextDay };
}

export async function processAllWarmingMailboxes() {
  const warming = await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.warmupStatus, "warming"));
  const results = [];
  for (const m of warming) {
    results.push(await processMailboxWarmup(m.id));
  }
  return results;
}
