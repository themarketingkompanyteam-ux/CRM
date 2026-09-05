import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket") ?? "Hot";

  let whereClause;
  if (bucket === "CallBack") {
    whereClause = sql`c.next_follow_up_at IS NOT NULL`;
  } else {
    whereClause = sql`c.lead_status = ${bucket}`;
  }

  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    lead_status: string;
    next_follow_up_at: string | null;
    last_outcome: string | null;
    last_notes: string | null;
    last_call_at: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email, co.name AS company_name,
      c.lead_status, c.next_follow_up_at,
      (SELECT outcome FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_outcome,
      (SELECT notes FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_notes,
      (SELECT created_at FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_call_at
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    WHERE ${whereClause}
    ORDER BY c.next_follow_up_at ASC NULLS LAST, c.updated_at DESC
    LIMIT 300
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      phone: r.phone,
      email: r.email,
      companyName: r.company_name,
      leadStatus: r.lead_status,
      nextFollowUpAt: r.next_follow_up_at,
      lastOutcome: r.last_outcome,
      lastNotes: r.last_notes,
      lastCallAt: r.last_call_at,
    }))
  );
}
