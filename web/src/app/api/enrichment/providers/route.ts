import { NextResponse } from "next/server";
import { db } from "@/db";
import { enrichmentProviders } from "@/db/schema";
import { getAdapter } from "@/lib/enrichment/registry";

export async function GET() {
  const rows = await db.select().from(enrichmentProviders).orderBy(enrichmentProviders.priority);

  return NextResponse.json(
    rows.map((r) => {
      const adapter = getAdapter(r.key);
      return {
        key: r.key,
        label: adapter?.label ?? r.key,
        configured: adapter?.configured ?? false,
        enabled: !!r.enabled,
        priority: r.priority,
        supportsEmail: !!r.supportsEmail,
        supportsPhone: !!r.supportsPhone,
        status: r.status,
        creditsRemaining: r.creditsRemaining,
        creditsCheckedAt: r.creditsCheckedAt,
        lastTestedAt: r.lastTestedAt,
        lastSuccessAt: r.lastSuccessAt,
        lastErrorAt: r.lastErrorAt,
        lastErrorMessage: r.lastErrorMessage,
        usageCount: r.usageCount,
        successCount: r.successCount,
        failureCount: r.failureCount,
        maxDailyUsage: r.maxDailyUsage,
        maxMonthlyUsage: r.maxMonthlyUsage,
      };
    })
  );
}
