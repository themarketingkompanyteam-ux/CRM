import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentQueue } from "@/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const mode: string = body.mode ?? "hot";
  const contactIds: number[] = Array.isArray(body.contactIds) ? body.contactIds.map(Number) : [];

  let candidateIds: number[] = [];

  if (mode === "selected") {
    candidateIds = contactIds;
  } else {
    const leadStatuses =
      mode === "hot" ? ["Hot"] : mode === "hot_warm" ? ["Hot", "Warm"] : ["Hot", "Warm", "Cold"]; // "all"

    const rows = await db.execute<{ id: number }>(sql`
      SELECT id FROM contacts
      WHERE lead_status = ANY(${leadStatuses})
        AND enrichment_status = 'NOT_ENRICHED'
    `);
    candidateIds = rows.map((r) => r.id);
  }

  let queued = 0;
  for (const contactId of candidateIds) {
    const [row] = await db
      .insert(enrichmentQueue)
      .values({ contactId, status: "QUEUED", source: mode === "selected" ? "manual" : "hot_leads" })
      .onConflictDoUpdate({
        target: enrichmentQueue.contactId,
        set: { status: "QUEUED", updatedAt: new Date() },
      })
      .returning();
    if (row) queued++;
  }

  return NextResponse.json({ status: "queued", count: queued });
}
