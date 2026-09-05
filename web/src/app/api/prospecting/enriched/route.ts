import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    job_title: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    lead_status: string;
    enrichment_confidence: number | null;
    enrichment_provider: string | null;
    enriched_at: string | null;
    last_called_at: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.job_title, co.name AS company_name,
           c.email, c.phone, c.lead_status, c.enrichment_confidence, c.enrichment_provider,
           c.enriched_at, c.last_called_at
    FROM contacts c
    LEFT JOIN companies co ON co.id = c.company_id
    WHERE c.pushed_to_prospecting_enriched = 1
    ORDER BY c.enriched_at DESC NULLS LAST
    LIMIT 300
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      jobTitle: r.job_title,
      companyName: r.company_name,
      email: r.email,
      phone: r.phone,
      leadStatus: r.lead_status,
      confidence: r.enrichment_confidence,
      provider: r.enrichment_provider,
      enrichedAt: r.enriched_at,
      lastCalledAt: r.last_called_at,
    }))
  );
}
