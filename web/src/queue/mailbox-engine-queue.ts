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

/** Idempotent: upsertJobScheduler replaces any existing scheduler with the same id, safe to call on every worker boot. */
export async function scheduleMailboxEngineRepeatJobs() {
  await mailboxEngineQueue.upsertJobScheduler("due-sequences", { every: 2 * 60 * 1000 }, { data: { type: "process-due-sequences" } });
  await mailboxEngineQueue.upsertJobScheduler("health", { every: 15 * 60 * 1000 }, { data: { type: "recalculate-health" } });
  await mailboxEngineQueue.upsertJobScheduler("warmup", { pattern: "0 6 * * *" }, { data: { type: "process-warmup" } }); // 06:00 daily
  await mailboxEngineQueue.upsertJobScheduler("daily-reset", { pattern: "0 0 * * *" }, { data: { type: "reset-daily-counters" } }); // midnight daily
}
