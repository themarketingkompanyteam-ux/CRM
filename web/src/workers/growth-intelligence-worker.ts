import { Worker } from "bullmq";
import { redisConnection } from "@/queue/connection";
import type { GrowthIntelligenceJobData } from "@/queue/growth-intelligence-queue";
import { runGrowthIntelligencePipeline } from "@/lib/ai/pipeline";

const worker = new Worker<GrowthIntelligenceJobData>(
  "growth-intelligence",
  async (job) => {
    await runGrowthIntelligencePipeline(job.data.contactId, { forceRefresh: job.data.forceRefresh });
  },
  // Concurrency 1 + a spacing limiter: Gemini calls are chained per contact
  // (research -> opportunities -> scoring -> brief -> outreach -> script),
  // so keep this conservative to respect rate limits across the whole batch.
  { connection: redisConnection, concurrency: 2, limiter: { max: 20, duration: 60_000 } }
);

worker.on("failed", (job, err) => {
  console.error("Growth Intelligence job failed", job?.id, err);
});

console.log("Growth Intelligence worker started, waiting for jobs...");
