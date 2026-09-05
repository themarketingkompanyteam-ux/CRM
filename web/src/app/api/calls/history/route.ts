import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const rows = await db.execute<{
    id: number;
    contact_id: number;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    company_name: string | null;
    outcome: string | null;
    lead_temperature: string | null;
    notes: string | null;
    duration_seconds: number;
    created_at: string;
  }>(sql`
    SELECT c.id, c.contact_id, ct.first_name, ct.last_name, ct.phone, co.name AS company_name,
           c.outcome, c.lead_temperature, c.notes, c.duration_seconds, c.created_at
    FROM calls c
    JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN companies co ON co.id = ct.company_id
    WHERE c.created_at::date = ${date}::date
    ORDER BY c.created_at DESC
  `);

  const summary = await db.execute<{ outcome: string; count: number }>(sql`
    SELECT outcome, COUNT(*)::int as count FROM calls
    WHERE created_at::date = ${date}::date
    GROUP BY outcome
  `);

  return NextResponse.json({
    date,
    calls: rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      phone: r.phone,
      companyName: r.company_name,
      outcome: r.outcome,
      leadTemperature: r.lead_temperature,
      notes: r.notes,
      durationSeconds: r.duration_seconds,
      createdAt: r.created_at,
    })),
    total: rows.length,
    byOutcome: Object.fromEntries(summary.map((s) => [s.outcome, Number(s.count)])),
  });
}
