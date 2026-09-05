import { Worker } from "bullmq";
import { redisConnection } from "@/queue/connection";
import type { EmailCampaignJobData } from "@/queue/email-campaign-queue";
import { pushPendingLeadsToInstantly, syncSendingAccounts, syncCampaignAnalytics } from "@/lib/email/campaign-service";

const worker = new Worker<EmailCampaignJobData>(
  "email-campaign",
  async (job) => {
    if (job.data.type === "push-leads") {
      await pushPendingLeadsToInstantly(job.data.campaignId);
    } else if (job.data.type === "sync-accounts") {
      await syncSendingAccounts();
    } else if (job.data.type === "sync-analytics") {
      await syncCampaignAnalytics(job.data.campaignId);
    }
  },
  { connection: redisConnection, concurrency: 3 }
);

worker.on("failed", (job, err) => {
  console.error("Email campaign job failed", job?.id, job?.data, err);
});

console.log("Email campaign worker started, waiting for jobs...");
