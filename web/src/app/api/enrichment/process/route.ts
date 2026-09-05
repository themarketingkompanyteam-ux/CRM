import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentQueue } from "@/db/schema";
import { enrichmentQueueBull } from "@/queue/enrichment-queue";

export async function POST() {
  const queued = await db.select().from(enrichmentQueue).where(eq(enrichmentQueue.status, "QUEUED"));

  for (const item of queued) {
    await enrichmentQueueBull.add("enrich", { contactId: item.contactId, operation: "search_email" });
  }

  return NextResponse.json({ status: "processing", count: queued.length });
}
