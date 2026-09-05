import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export type ImportJobData = {
  jobId: number;
  filePath: string;
  listId?: number | null;
};

export const importQueue = new Queue<ImportJobData>("csv-import", {
  connection: redisConnection,
});
