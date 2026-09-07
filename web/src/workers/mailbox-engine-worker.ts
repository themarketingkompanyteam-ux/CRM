import { Worker } from "bullmq";
import { redisConnection } from "@/queue/connection";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import type { MailboxEngineJobData } from "@/queue/mailbox-engine-queue";
import { scheduleMailboxEngineRepeatJobs } from "@/queue/mailbox-engine-queue";
import { processDueSequenceSends } from "@/lib/mailbox/sequence-engine";
import { processAllWarmingMailboxes } from "@/lib/mailbox/warmup";
import { resetDailyCounters } from "@/lib/mailbox/daily-reset";
import { recalculateMailboxHealth } from "@/lib/mailbox/health";
import { sendToContact } from "@/lib/mailbox/send-engine";

const worker = new Worker<MailboxEngineJobData>(
  "mailbox-engine",
  async (job) => {
    switch (job.data.type) {
      case "process-due-sequences":
        return processDueSequenceSends();
      case "process-warmup":
        return processAllWarmingMailboxes();
      case "reset-daily-counters":
        return resetDailyCounters();
      case "recalculate-health": {
        const all = await db.select({ id: mailboxes.id }).from(mailboxes);
        for (const m of all) await recalculateMailboxHealth(m.id);
        return { checked: all.length };
      }
      case "send-single":
        return sendToContact(job.data.contactId, { subject: job.data.subject, body: job.data.body });
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

worker.on("failed", (job, err) => {
  console.error("Mailbox engine job failed", job?.id, job?.data, err);
});

scheduleMailboxEngineRepeatJobs().catch((err) => console.error("Failed to schedule mailbox engine repeat jobs", err));

console.log("Mailbox engine worker started, waiting for jobs...");
