import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    last_outcome: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, co.name AS company_name,
      (SELECT outcome FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_outcome
    FROM contacts c
    LEFT JOIN companies co ON c.company_id = co.id
    WHERE c.lead_status = 'Hot'
    ORDER BY c.updated_at DESC
    LIMIT 6
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      companyName: r.company_name,
      lastOutcome: r.last_outcome,
    }))
  );
}
