import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrichmentCandidates } from "@/db/schema";

export async function GET() {
  const rows = await db
    .select()
    .from(enrichmentCandidates)
    .where(eq(enrichmentCandidates.status, "PENDING"))
    .orderBy(desc(enrichmentCandidates.createdAt))
    .limit(100);
  return NextResponse.json(rows);
}
