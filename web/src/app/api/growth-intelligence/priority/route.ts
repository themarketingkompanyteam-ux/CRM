import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  const rows = await db.execute<{
    id: number;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    lead_status: string;
    ai_opportunity_score: number | null;
    ai_primary_opportunity: string | null;
    ai_recommended_service: string | null;
    ai_analyzed_at: string | null;
    confidence: number | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email, co.name AS company_name,
           c.lead_status, c.ai_opportunity_score, c.ai_primary_opportunity, c.ai_recommended_service,
           c.ai_analyzed_at, s.data_confidence_score AS confidence
    FROM contacts c
    LEFT JOIN companies co ON co.id = c.company_id
    LEFT JOIN ai_scores s ON s.contact_id = c.id
    WHERE c.ai_status = 'COMPLETED' AND c.ai_pushed_to_prospecting = 1
    ORDER BY c.ai_opportunity_score DESC NULLS LAST,
             CASE c.lead_status WHEN 'Hot' THEN 0 WHEN 'Warm' THEN 1 ELSE 2 END,
             c.ai_analyzed_at DESC NULLS LAST
    LIMIT 100
  `);

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      email: r.email,
      companyName: r.company_name,
      leadStatus: r.lead_status,
      opportunityScore: r.ai_opportunity_score,
      primaryOpportunity: r.ai_primary_opportunity,
      recommendedService: r.ai_recommended_service,
      analyzedAt: r.ai_analyzed_at,
      confidence: r.confidence,
    }))
  );
}
