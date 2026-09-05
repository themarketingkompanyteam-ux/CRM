import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export type EmailCampaignJobData =
  | { type: "push-leads"; campaignId: number }
  | { type: "sync-accounts" }
  | { type: "sync-analytics"; campaignId: number };

export const emailCampaignQueue = new Queue<EmailCampaignJobData>("email-campaign", {
  connection: redisConnection,
});
