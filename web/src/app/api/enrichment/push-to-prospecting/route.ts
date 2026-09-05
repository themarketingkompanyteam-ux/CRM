import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { contacts, enrichmentQueue } from "@/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactIds: number[] = Array.isArray(body.contactIds) ? body.contactIds.map(Number) : [];
  if (contactIds.length === 0) return NextResponse.json({ error: "contactIds is required" }, { status: 400 });

  await db
    .update(contacts)
    .set({ pushedToProspectingEnriched: 1, updatedAt: new Date() })
    .where(inArray(contacts.id, contactIds));

  await db
    .update(enrichmentQueue)
    .set({ status: "PUSHED_TO_PROSPECTING", updatedAt: new Date() })
    .where(inArray(enrichmentQueue.contactId, contactIds));

  return NextResponse.json({ status: "pushed", count: contactIds.length });
}
