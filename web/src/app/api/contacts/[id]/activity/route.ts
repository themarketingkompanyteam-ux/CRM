import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const contactId = Number(id);

  const rows = await db.execute<{
    kind: string;
    body: string | null;
    outcome: string | null;
    lead_temperature: string | null;
    duration_seconds: number | null;
    created_at: string;
  }>(sql`
    SELECT 'activity' AS kind, COALESCE(body, type) AS body, type AS outcome, NULL AS lead_temperature, NULL AS duration_seconds, created_at
    FROM activities WHERE contact_id = ${contactId}
    UNION ALL
    SELECT 'call' AS kind, notes AS body, outcome, lead_temperature, duration_seconds, created_at
    FROM calls WHERE contact_id = ${contactId}
    UNION ALL
    SELECT 'task' AS kind, title AS body, NULL AS outcome, NULL AS lead_temperature, NULL AS duration_seconds, created_at
    FROM tasks WHERE contact_id = ${contactId}
    ORDER BY created_at DESC
    LIMIT 100
  `);

  return NextResponse.json(rows);
}
