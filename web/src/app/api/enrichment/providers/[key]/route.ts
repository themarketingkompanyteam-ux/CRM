import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentProviders } from "@/db/schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled ? 1 : 0;
  if (typeof body.priority === "number") patch.priority = body.priority;
  if (body.maxDailyUsage === null || typeof body.maxDailyUsage === "number") patch.maxDailyUsage = body.maxDailyUsage;
  if (body.maxMonthlyUsage === null || typeof body.maxMonthlyUsage === "number") patch.maxMonthlyUsage = body.maxMonthlyUsage;

  await db.update(enrichmentProviders).set(patch).where(eq(enrichmentProviders.key, key));
  return NextResponse.json({ status: "updated" });
}
