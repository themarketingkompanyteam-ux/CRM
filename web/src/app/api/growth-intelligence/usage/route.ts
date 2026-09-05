import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { countAiRunsToday, getGrowthIntelligenceSettings } from "@/lib/ai/settings";

export async function GET() {
  const [totals] = await db.execute<{
    total_requests: number;
    success_count: number;
    failed_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
  }>(sql`
    SELECT
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success_count,
      COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
      COALESCE(SUM(input_tokens), 0)::int AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0)::int AS total_output_tokens
    FROM ai_usage_log
  `);

  const byOperation = await db.execute<{ operation: string; count: number }>(sql`
    SELECT operation, COUNT(*)::int as count FROM ai_usage_log GROUP BY operation ORDER BY count DESC
  `);

  const [usedToday, settings] = await Promise.all([countAiRunsToday(), getGrowthIntelligenceSettings()]);

  return NextResponse.json({
    totalRequests: totals.total_requests,
    successCount: totals.success_count,
    failedCount: totals.failed_count,
    totalInputTokens: totals.total_input_tokens,
    totalOutputTokens: totals.total_output_tokens,
    byOperation,
    usedToday,
    dailyLimit: settings.dailyAiLimit,
  });
}
