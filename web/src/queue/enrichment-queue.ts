import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export type EnrichmentJobData = {
  contactId: number;
  operation: "search_email" | "find_phone";
};

export const enrichmentQueueBull = new Queue<EnrichmentJobData>("enrichment", {
  connection: redisConnection,
});
