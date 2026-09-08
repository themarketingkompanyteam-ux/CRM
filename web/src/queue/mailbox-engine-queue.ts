import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export type MailboxEngineJobData =
  | { type: "process-due-sequences" }
  | { type: "process-warmup" }
  | { type: "reset-daily-counters" }
  | { type: "recalculate-health" }
  | { type: "send-single"; contactId: number; subject: string; body: string };

export const mailboxEngineQueue = new Queue<MailboxEngineJobData>("mailbox-engine", {
  connection: redisConnection,
});

/**
 * Idempotent: upsertJobScheduler replaces any existing scheduler with the same id, safe to call
 * on every worker boot. Warmup and daily-reset run every 10 minutes rather than exactly at their
 * nominal time (06:00 / midnight) — both are internally guarded to apply at most once per
 * calendar day (see warmup.ts / daily-reset.ts), so the frequent check is purely a self-healing
 * mechanism: if the worker was down at the exact trigger moment, it catches up within 10 minutes
 * of coming back instead of silently missing that day's reset/ramp entirely.
 */
export async function scheduleMailboxEngineRepeatJobs() {
  await mailboxEngineQueue.upsertJobScheduler("due-sequences", { every: 2 * 60 * 1000 }, { data: { type: "process-due-sequences" } });
  await mailboxEngineQueue.upsertJobScheduler("health", { every: 15 * 60 * 1000 }, { data: { type: "recalculate-health" } });
  await mailboxEngineQueue.upsertJobScheduler("warmup", { every: 10 * 60 * 1000 }, { data: { type: "process-warmup" } });
  await mailboxEngineQueue.upsertJobScheduler("daily-reset", { every: 10 * 60 * 1000 }, { data: { type: "reset-daily-counters" } });
}
