import { db } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { AIUsage } from "./types";

export async function logAiUsage(params: {
  contactId: number | null;
  operation: string;
  model: string;
  promptVersion: string;
  status: "SUCCESS" | "FAILED";
  usage: AIUsage;
  durationMs: number;
  errorMessage?: string;
}) {
  await db.insert(aiUsageLog).values({
    contactId: params.contactId,
    operation: params.operation,
    model: params.model,
    promptVersion: params.promptVersion,
    status: params.status,
    inputTokens: params.usage.inputTokens,
    outputTokens: params.usage.outputTokens,
    totalTokens: params.usage.totalTokens,
    durationMs: params.durationMs,
    errorMessage: params.errorMessage,
  });
}
