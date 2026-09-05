import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { growthIntelligenceQueue } from "@/queue/growth-intelligence-queue";
import { getGrowthIntelligenceSettings, countAiRunsToday } from "@/lib/ai/settings";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const forceRefresh = body.forceRefresh === true;

  let contactIds: number[] = [];
  if (Array.isArray(body.contactIds)) {
    contactIds = body.contactIds.map(Number);
  } else if (body.mode === "hot") {
    const rows = await db.execute<{ id: number }>(
      sql`SELECT id FROM contacts WHERE lead_status = 'Hot'`
    );
    contactIds = rows.map((r) => r.id);
  } else if (body.contactId) {
    contactIds = [Number(body.contactId)];
  }

  if (contactIds.length === 0) {
    return NextResponse.json({ error: "No contacts specified" }, { status: 400 });
  }

  const settings = await getGrowthIntelligenceSettings();
  const usedToday = await countAiRunsToday();
  const remaining = Math.max(0, settings.dailyAiLimit - usedToday);

  const toRun = contactIds.slice(0, remaining);
  const deferred = contactIds.slice(remaining);

  for (const contactId of toRun) {
    await db.update(contacts).set({ aiStatus: "QUEUED", updatedAt: new Date() }).where(eq(contacts.id, contactId));
    await growthIntelligenceQueue.add("analyze", { contactId, forceRefresh });
  }
  if (deferred.length > 0) {
    await db.update(contacts).set({ aiStatus: "QUEUED", updatedAt: new Date() }).where(inArray(contacts.id, deferred));
  }

  return NextResponse.json({
    queued: toRun.length,
    deferredByDailyLimit: deferred.length,
    dailyLimit: settings.dailyAiLimit,
    usedToday,
  });
}
