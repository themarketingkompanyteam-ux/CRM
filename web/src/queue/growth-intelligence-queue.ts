import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export type GrowthIntelligenceJobData = {
  contactId: number;
  forceRefresh?: boolean;
};

export const growthIntelligenceQueue = new Queue<GrowthIntelligenceJobData>("growth-intelligence", {
  connection: redisConnection,
});
