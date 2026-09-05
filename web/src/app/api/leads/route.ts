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
    linkedin_url: string | null;
    company_name: string | null;
    lead_status: string;
    next_follow_up_at: string | null;
    last_outcome: string | null;
    last_notes: string | null;
    last_call_at: string | null;
    enrichment_status: string;
    enrichment_confidence: number | null;
    enrichment_provider: string | null;
    ai_status: string;
    ai_opportunity_score: number | null;
    extra_emails: { email: string; provider: string | null }[];
    extra_phones: { phone: string; provider: string | null }[];
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.phone, c.email, c.linkedin_url, co.name AS company_name,
      c.lead_status, c.next_follow_up_at,
      c.enrichment_status, c.enrichment_confidence, c.enrichment_provider,
      c.ai_status, c.ai_opportunity_score,
      (SELECT outcome FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_outcome,
      (SELECT notes FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_notes,
      (SELECT created_at FROM calls WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_call_at,
      COALESCE((SELECT json_agg(json_build_object('email', email, 'provider', provider))
                FROM contact_emails WHERE contact_id = c.id AND email != COALESCE(c.email, '')), '[]') AS extra_emails,
      COALESCE((SELECT json_agg(json_build_object('phone', phone, 'provider', provider))
                FROM contact_phones WHERE contact_id = c.id AND phone != COALESCE(c.phone, '')), '[]') AS extra_phones
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
      linkedinUrl: r.linkedin_url,
      companyName: r.company_name,
      leadStatus: r.lead_status,
      nextFollowUpAt: r.next_follow_up_at,
      lastOutcome: r.last_outcome,
      lastNotes: r.last_notes,
      lastCallAt: r.last_call_at,
      enrichmentStatus: r.enrichment_status,
      enrichmentConfidence: r.enrichment_confidence,
      enrichmentProvider: r.enrichment_provider,
      extraEmails: r.extra_emails ?? [],
      extraPhones: r.extra_phones ?? [],
      aiStatus: r.ai_status,
      aiOpportunityScore: r.ai_opportunity_score,
    }))
  );
}
