import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, mailboxAuditLog } from "@/db/schema";

export type HealthResult = {
  score: number;
  status: "healthy" | "monitoring" | "throttled" | "paused";
  reasons: string[];
  recommendedAction: string;
};

const BOUNCE_RATE_MONITOR = 0.03; // 3%
const BOUNCE_RATE_THROTTLE = 0.05; // 5% — matches the spec's stated threshold
const BOUNCE_RATE_PAUSE = 0.1; // 10%

/** Internal risk score only — never presented as an official Gmail/Microsoft reputation score. */
export function calculateMailboxHealth(mailbox: {
  connectionStatus: string;
  sentToday: number;
  bouncedToday: number;
  unsubscribesToday: number;
  lastConnectionError: string | null;
}): HealthResult {
  const reasons: string[] = [];
  let score = 100;

  if (mailbox.connectionStatus === "error") {
    reasons.push(`Connection error: ${mailbox.lastConnectionError ?? "unknown"}`);
    return { score: 0, status: "paused", reasons, recommendedAction: "Reconnect the mailbox before resuming sending." };
  }

  const bounceRate = mailbox.sentToday > 0 ? mailbox.bouncedToday / mailbox.sentToday : 0;
  const unsubRate = mailbox.sentToday > 0 ? mailbox.unsubscribesToday / mailbox.sentToday : 0;

  if (bounceRate >= BOUNCE_RATE_PAUSE) {
    reasons.push(`Bounce rate ${(bounceRate * 100).toFixed(1)}% is severe (>= ${BOUNCE_RATE_PAUSE * 100}%)`);
    score -= 70;
  } else if (bounceRate >= BOUNCE_RATE_THROTTLE) {
    reasons.push(`Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeds the throttle threshold (${BOUNCE_RATE_THROTTLE * 100}%)`);
    score -= 40;
  } else if (bounceRate >= BOUNCE_RATE_MONITOR) {
    reasons.push(`Bounce rate ${(bounceRate * 100).toFixed(1)}% is elevated`);
    score -= 15;
  }

  if (unsubRate > 0.02) {
    reasons.push(`Unsubscribe rate ${(unsubRate * 100).toFixed(1)}% is elevated`);
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let status: HealthResult["status"] = "healthy";
  let recommendedAction = "No major issues detected.";
  if (bounceRate >= BOUNCE_RATE_PAUSE) {
    status = "paused";
    recommendedAction = "Pause this mailbox and review recent sends — bounce rate indicates a serious deliverability problem.";
  } else if (bounceRate >= BOUNCE_RATE_THROTTLE) {
    status = "throttled";
    recommendedAction = "Reduce daily volume until the bounce rate recovers.";
  } else if (bounceRate >= BOUNCE_RATE_MONITOR || unsubRate > 0.02) {
    status = "monitoring";
    recommendedAction = "Watch closely before increasing warmup volume further.";
  }

  if (reasons.length === 0) reasons.push("No major issues detected.");

  return { score, status, reasons, recommendedAction };
}

export async function recalculateMailboxHealth(mailboxId: number) {
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
  if (!mailbox) return null;

  const result = calculateMailboxHealth(mailbox);
  const wasPaused = mailbox.healthStatus === "paused";
  const nowPaused = result.status === "paused";

  await db
    .update(mailboxes)
    .set({
      healthScore: result.score,
      healthStatus: result.status,
      healthReasons: result.reasons,
      lastHealthCheckAt: new Date(),
      campaignEnabled: nowPaused ? 0 : mailbox.campaignEnabled,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, mailboxId));

  if (nowPaused && !wasPaused) {
    await db.insert(mailboxAuditLog).values({
      mailboxId,
      action: "auto_paused",
      reason: result.reasons.join("; "),
      metadata: { score: result.score },
    });
  }

  return result;
}
