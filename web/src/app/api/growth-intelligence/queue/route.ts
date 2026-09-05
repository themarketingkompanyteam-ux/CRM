import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    lead_status: string;
    ai_status: string;
    ai_opportunity_score: number | null;
    ai_primary_opportunity: string | null;
    ai_last_error: string | null;
    ai_analyzed_at: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, co.name AS company_name, c.lead_status,
           c.ai_status, c.ai_opportunity_score, c.ai_primary_opportunity, c.ai_last_error, c.ai_analyzed_at
    FROM contacts c
    LEFT JOIN companies co ON co.id = c.company_id
    WHERE c.ai_status != 'NOT_ANALYZED'
    ${status ? sql`AND c.ai_status = ${status}` : sql``}
    ORDER BY c.ai_opportunity_score DESC NULLS LAST, c.updated_at DESC
    LIMIT 300
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      companyName: r.company_name,
      leadStatus: r.lead_status,
      aiStatus: r.ai_status,
      opportunityScore: r.ai_opportunity_score,
      primaryOpportunity: r.ai_primary_opportunity,
      lastError: r.ai_last_error,
      analyzedAt: r.ai_analyzed_at,
    }))
  );
}
